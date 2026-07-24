// KNetraHub PAM SSH session gateway (bastion).
//
// A brokered SSH gateway: the KNetraHub user connects here over a WebSocket
// carrying a short-lived, audience-scoped gateway token (never the target
// credential). The gateway verifies the token (HS256, audience
// "knetrahub-pam-gateway"), calls the control plane's gateway/checkout to
// retrieve the target credential INSIDE the trusted gateway, opens the SSH
// connection, streams terminal I/O to the browser while recording it, enforces
// idle + maximum-duration timeouts, then posts events/commands/recording
// metadata back to gateway/ingest.
//
// Hardening (spec §3.4):
//   - Secrets resolve from NAME or NAME_FILE (Docker secret), matching the app.
//   - Host keys are validated against a managed known-hosts store; the insecure
//     "ignore host key" callback is gone. Unknown hosts are blocked by default
//     (report the fingerprint for approval) unless TOFU is explicitly enabled.
//   - Liveness /healthz and readiness /readyz; a `-healthcheck` mode lets the
//     distroless container probe itself without a shell.
//   - Graceful shutdown: on SIGTERM the gateway drains (refuses new sessions,
//     waits for active ones) before exiting.
//   - Password AND private-key SSH auth; per-session correlation id in logs.
//
// The target credential is never sent to the browser. This process listens on
// the internal PAM overlay network only.
package main

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
	"golang.org/x/crypto/ssh"
)

const audience = "knetrahub-pam-gateway"

var (
	controlPlaneURL = env("PAM_CONTROL_PLANE_URL", "http://app:3000")
	listenAddr      = env("PAM_GATEWAY_LISTEN", ":4222")
	drainSeconds    = envInt("PAM_GATEWAY_DRAIN_SECONDS", 30)
	tofu            = env("PAM_HOSTKEY_TOFU", "false") == "true"

	jwtSecret      string
	knownHosts     map[string]map[string]bool
	allowedOrigins []string

	upgrader = websocket.Upgrader{CheckOrigin: func(r *http.Request) bool {
		return originAllowed(r.Header.Get("Origin"), allowedOrigins)
	}}

	activeSessions int64 // atomic
	draining       int32 // atomic (0/1)
)

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func envInt(k string, def int) int {
	if v := os.Getenv(k); v != "" {
		var n int
		if _, err := fmt.Sscanf(v, "%d", &n); err == nil {
			return n
		}
	}
	return def
}

// resolveSecret reads NAME_FILE (Docker secret) if present, else NAME. The
// distroless binary runs directly (no entrypoint shell), so it must resolve
// _FILE itself — this is the fix for the crash-loop where compose injected
// NUXT_JWT_SECRET_FILE but the binary only read NUXT_JWT_SECRET.
func resolveSecret(name string) string {
	if f := os.Getenv(name + "_FILE"); f != "" {
		if b, err := os.ReadFile(f); err == nil {
			return strings.TrimSpace(string(b))
		}
		log.Printf("[gateway] WARNING: cannot read %s_FILE", name)
	}
	return strings.TrimSpace(os.Getenv(name))
}

func originAllowed(origin string, allowed []string) bool {
	if origin == "" || len(allowed) == 0 {
		return true // internal-only network / non-browser client
	}
	for _, a := range allowed {
		if strings.EqualFold(strings.TrimSpace(a), origin) {
			return true
		}
	}
	return false
}

func newCID() string {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// ── Minimal HS256 JWT verification (no external JWT dep) ──────────────────────

type gatewayClaims struct {
	SessionID string `json:"sessionId"`
	AccountID string `json:"accountId"`
	GrantID   string `json:"grantId"`
	Protocol  string `json:"protocol"`
	User      string `json:"user"`
	Jti       string `json:"jti"`
	Aud       string `json:"aud"`
	Iat       int64  `json:"iat"`
	Nbf       int64  `json:"nbf"`
	Exp       int64  `json:"exp"`
}

func verifyToken(token, secret string) (*gatewayClaims, error) {
	if secret == "" {
		return nil, fmt.Errorf("gateway not configured")
	}
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, fmt.Errorf("malformed token")
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(parts[0] + "." + parts[1]))
	expected := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(expected), []byte(parts[2])) {
		return nil, fmt.Errorf("bad signature")
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, err
	}
	var c gatewayClaims
	if err := json.Unmarshal(payload, &c); err != nil {
		return nil, err
	}
	now := time.Now().Unix()
	if c.Aud != audience {
		return nil, fmt.Errorf("wrong audience")
	}
	if c.Exp != 0 && now > c.Exp {
		return nil, fmt.Errorf("token expired")
	}
	if c.Nbf != 0 && now+30 < c.Nbf {
		return nil, fmt.Errorf("token not yet valid")
	}
	return &c, nil
}

// ── Host-key validation (managed known-hosts) ─────────────────────────────────

// hostKeyFingerprint is base64(sha256(marshalled public key)) — the value the
// control plane stores in the managed known-hosts store.
func hostKeyFingerprint(key ssh.PublicKey) string {
	sum := sha256.Sum256(key.Marshal())
	return base64.RawStdEncoding.EncodeToString(sum[:])
}

// parseKnownHosts reads "host fingerprint" lines (# comments allowed) into a
// host → set-of-approved-fingerprints map.
func parseKnownHosts(data []byte) map[string]map[string]bool {
	out := map[string]map[string]bool{}
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		f := strings.Fields(line)
		if len(f) < 2 {
			continue
		}
		host := strings.ToLower(f[0])
		if out[host] == nil {
			out[host] = map[string]bool{}
		}
		out[host][f[1]] = true
	}
	return out
}

// hostKeyVerdict decides whether to accept a presented host key. Pure, so it is
// unit-tested. Returns (accept, reason).
func hostKeyVerdict(known map[string]map[string]bool, host, fingerprint string, tofuAllowed bool) (bool, string) {
	host = strings.ToLower(host)
	if set, ok := known[host]; ok {
		if set[fingerprint] {
			return true, "known host key matched"
		}
		return false, "host key MISMATCH — refusing (possible MITM)"
	}
	if tofuAllowed {
		return true, "unknown host key accepted under TOFU (reported for approval)"
	}
	return false, "unknown host key — not approved (set PAM_HOSTKEY_TOFU=true to trust-on-first-use)"
}

func hostKeyCallback(token, cid string) ssh.HostKeyCallback {
	return func(hostname string, remote net.Addr, key ssh.PublicKey) error {
		host := hostname
		if h, _, err := net.SplitHostPort(hostname); err == nil {
			host = h
		}
		fp := hostKeyFingerprint(key)
		accept, reason := hostKeyVerdict(knownHosts, host, fp, tofu)
		ingest(token, ingestPayload{Events: []map[string]any{{
			"kind":   "hostkey.check",
			"detail": map[string]any{"host": host, "fingerprint": fp, "type": key.Type(), "accepted": accept, "reason": reason, "cid": cid},
		}}})
		if !accept {
			return fmt.Errorf("%s (host %s, %s)", reason, host, fp)
		}
		return nil
	}
}

// ── Control-plane calls ────────────────────────────────────────────────────────

type checkoutResponse struct {
	Protocol string `json:"protocol"`
	Target   struct {
		Host string `json:"host"`
		Port int    `json:"port"`
	} `json:"target"`
	Credential struct {
		Username   string `json:"username"`
		Value      string `json:"value"`
		ValueType  string `json:"valueType"`
		Passphrase string `json:"passphrase"`
	} `json:"credential"`
	IdleTimeoutSeconds int `json:"idleTimeoutSeconds"`
	MaxDurationSeconds int `json:"maxDurationSeconds"`
}

func checkout(token string) (*checkoutResponse, error) {
	req, _ := http.NewRequest("POST", controlPlaneURL+"/api/pam/v1/gateway/checkout", nil)
	req.Header.Set("authorization", "Bearer "+token)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("checkout failed: HTTP %d", resp.StatusCode)
	}
	var out checkoutResponse
	return &out, json.NewDecoder(resp.Body).Decode(&out)
}

type ingestPayload struct {
	State     string           `json:"state,omitempty"`
	Events    []map[string]any `json:"events,omitempty"`
	Commands  []map[string]any `json:"commands,omitempty"`
	Recording map[string]any   `json:"recording,omitempty"`
}

type sessionStateResp struct {
	State      string `json:"state"`
	GrantValid bool   `json:"grantValid"`
}

// sessionState polls the control plane so a manager-terminated or grant-revoked
// session tears the live connection down (revocation propagation, spec §3.2/§11).
func sessionState(token string) (sessionStateResp, error) {
	req, _ := http.NewRequest("GET", controlPlaneURL+"/api/pam/v1/gateway/session-state", nil)
	req.Header.Set("authorization", "Bearer "+token)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return sessionStateResp{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return sessionStateResp{}, fmt.Errorf("status %d", resp.StatusCode)
	}
	var s sessionStateResp
	return s, json.NewDecoder(resp.Body).Decode(&s)
}

func ingest(token string, p ingestPayload) {
	body, _ := json.Marshal(p)
	req, _ := http.NewRequest("POST", controlPlaneURL+"/api/pam/v1/gateway/ingest", bytes.NewReader(body))
	req.Header.Set("authorization", "Bearer "+token)
	req.Header.Set("content-type", "application/json")
	if resp, err := http.DefaultClient.Do(req); err == nil {
		resp.Body.Close()
	} else {
		log.Printf("[gateway] ingest failed: %v", err)
	}
}

// ── SSH auth ───────────────────────────────────────────────────────────────────

func authMethods(c *checkoutResponse) ([]ssh.AuthMethod, error) {
	switch strings.ToLower(c.Credential.ValueType) {
	case "ssh_key", "private_key", "key", "pem":
		var signer ssh.Signer
		var err error
		if c.Credential.Passphrase != "" {
			signer, err = ssh.ParsePrivateKeyWithPassphrase([]byte(c.Credential.Value), []byte(c.Credential.Passphrase))
		} else {
			signer, err = ssh.ParsePrivateKey([]byte(c.Credential.Value))
		}
		if err != nil {
			return nil, fmt.Errorf("parse private key: %w", err)
		}
		return []ssh.AuthMethod{ssh.PublicKeys(signer)}, nil
	default:
		pw := c.Credential.Value
		return []ssh.AuthMethod{
			ssh.Password(pw),
			// Some targets negotiate keyboard-interactive for the same password.
			ssh.KeyboardInteractive(func(_, _ string, questions []string, _ []bool) ([]string, error) {
				ans := make([]string, len(questions))
				for i := range ans {
					ans[i] = pw
				}
				return ans, nil
			}),
		}, nil
	}
}

// ── WebSocket → SSH bridge with recording + command extraction ────────────────

func handleSession(w http.ResponseWriter, r *http.Request) {
	cid := newCID()
	if atomic.LoadInt32(&draining) == 1 {
		http.Error(w, "gateway draining", http.StatusServiceUnavailable)
		return
	}
	token := r.URL.Query().Get("token")
	claims, err := verifyToken(token, jwtSecret)
	if err != nil {
		http.Error(w, "unauthorized: "+err.Error(), http.StatusUnauthorized)
		return
	}
	co, err := checkout(token)
	if err != nil {
		http.Error(w, "checkout failed", http.StatusForbidden)
		return
	}
	log.Printf("[gateway] cid=%s session=%s user=%s target=%s:%d starting", cid, claims.SessionID, claims.User, co.Target.Host, co.Target.Port)

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	atomic.AddInt64(&activeSessions, 1)
	defer atomic.AddInt64(&activeSessions, -1)

	methods, err := authMethods(co)
	if err != nil {
		conn.WriteMessage(websocket.TextMessage, []byte("\r\nPAM: credential error\r\n"))
		ingest(token, ingestPayload{State: "error", Events: []map[string]any{{"kind": "auth.error", "detail": map[string]any{"error": err.Error(), "cid": cid}}}})
		return
	}
	cfg := &ssh.ClientConfig{
		User:            co.Credential.Username,
		Auth:            methods,
		HostKeyCallback: hostKeyCallback(token, cid),
		Timeout:         10 * time.Second,
	}
	addr := fmt.Sprintf("%s:%d", co.Target.Host, co.Target.Port)
	client, err := ssh.Dial("tcp", addr, cfg)
	if err != nil {
		conn.WriteMessage(websocket.TextMessage, []byte("\r\nPAM: target connection failed\r\n"))
		ingest(token, ingestPayload{State: "error", Events: []map[string]any{{"kind": "connect.failed", "detail": map[string]any{"error": err.Error(), "cid": cid}}}})
		return
	}
	defer client.Close()

	sess, err := client.NewSession()
	if err != nil {
		return
	}
	defer sess.Close()

	stdin, _ := sess.StdinPipe()
	stdout, _ := sess.StdoutPipe()
	sess.RequestPty("xterm-256color", 40, 120, ssh.TerminalModes{ssh.ECHO: 1})
	sess.Shell()
	ingest(token, ingestPayload{State: "active", Events: []map[string]any{{"kind": "connected", "detail": map[string]any{"target": addr, "cid": cid}}}})

	start := time.Now()
	idle := time.Duration(co.IdleTimeoutSeconds) * time.Second
	if idle <= 0 {
		idle = 15 * time.Minute
	}
	maxDur := time.Duration(co.MaxDurationSeconds) * time.Second
	if maxDur <= 0 {
		maxDur = 4 * time.Hour
	}
	var lastActivity atomic.Int64
	lastActivity.Store(time.Now().UnixNano())
	var recording bytes.Buffer
	commands := []map[string]any{}
	var cmdBuf strings.Builder

	// Target → browser (record output as asciicast frames).
	go func() {
		buf := make([]byte, 4096)
		for {
			n, err := stdout.Read(buf)
			if n > 0 {
				chunk := buf[:n]
				conn.WriteMessage(websocket.BinaryMessage, chunk)
				frame, _ := json.Marshal([]any{time.Since(start).Seconds(), "o", string(chunk)})
				recording.Write(frame)
				recording.WriteByte('\n')
				lastActivity.Store(time.Now().UnixNano())
			}
			if err != nil {
				conn.Close()
				return
			}
		}
	}()

	// Idle / max-duration / drain enforcement.
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go func() {
		ticker := time.NewTicker(3 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				since := time.Duration(time.Now().UnixNano() - lastActivity.Load())
				if since > idle {
					conn.WriteMessage(websocket.TextMessage, []byte("\r\nPAM: idle timeout\r\n"))
					conn.Close()
					return
				}
				if time.Since(start) > maxDur {
					conn.WriteMessage(websocket.TextMessage, []byte("\r\nPAM: maximum session duration reached\r\n"))
					conn.Close()
					return
				}
				if atomic.LoadInt32(&draining) == 1 {
					conn.WriteMessage(websocket.TextMessage, []byte("\r\nPAM: gateway draining — session closing\r\n"))
					conn.Close()
					return
				}
				// Revocation propagation: a manager terminate / grant revoke on
				// the control plane closes the live session within one interval.
				if st, err := sessionState(token); err == nil {
					if st.State == "terminated" || st.State == "ended" || st.State == "error" || !st.GrantValid {
						conn.WriteMessage(websocket.TextMessage, []byte("\r\nPAM: session terminated by policy/administrator\r\n"))
						ingest(token, ingestPayload{Events: []map[string]any{{"kind": "revoked", "detail": map[string]any{"state": st.State, "cid": cid}}}})
						conn.Close()
						return
					}
				}
			}
		}
	}()

	// Browser → target (extract command log on newline).
	for {
		_, data, err := conn.ReadMessage()
		if err != nil {
			break
		}
		lastActivity.Store(time.Now().UnixNano())
		stdin.Write(data)
		for _, b := range data {
			if b == '\r' || b == '\n' {
				line := strings.TrimSpace(cmdBuf.String())
				if line != "" {
					commands = append(commands, map[string]any{"command": line, "offset_ms": time.Since(start).Milliseconds()})
				}
				cmdBuf.Reset()
			} else {
				cmdBuf.WriteByte(b)
			}
		}
	}

	// Finalize: upload the recording bytes to the control-plane pipeline (which
	// encrypts, stores and independently verifies), then post the command log.
	if recording.Len() > 0 {
		uploadRecording(token, recording.Bytes(), time.Since(start).Milliseconds())
	}
	ingest(token, ingestPayload{
		State:    "ended",
		Commands: commands,
		Events:   []map[string]any{{"kind": "disconnected", "detail": map[string]any{"cid": cid}}},
	})
	log.Printf("[gateway] cid=%s session=%s ended (%d bytes, %d commands)", cid, claims.SessionID, recording.Len(), len(commands))
}

func uploadRecording(token string, data []byte, durationMs int64) {
	req, _ := http.NewRequest("POST", controlPlaneURL+"/api/pam/v1/gateway/recording", bytes.NewReader(data))
	req.Header.Set("authorization", "Bearer "+token)
	req.Header.Set("content-type", "application/octet-stream")
	req.Header.Set("x-pam-recording-format", "asciicast")
	req.Header.Set("x-pam-recording-duration-ms", fmt.Sprintf("%d", durationMs))
	if resp, err := http.DefaultClient.Do(req); err == nil {
		resp.Body.Close()
	} else {
		log.Printf("[gateway] recording upload failed: %v", err)
	}
}

// ── health / readiness ─────────────────────────────────────────────────────────

func handleHealthz(w http.ResponseWriter, r *http.Request) { w.Write([]byte("ok")) }

func handleReadyz(w http.ResponseWriter, r *http.Request) {
	if jwtSecret == "" {
		http.Error(w, "not ready: missing signing secret", http.StatusServiceUnavailable)
		return
	}
	if atomic.LoadInt32(&draining) == 1 {
		http.Error(w, "draining", http.StatusServiceUnavailable)
		return
	}
	fmt.Fprintf(w, "ready active=%d", atomic.LoadInt64(&activeSessions))
}

// selfHealthcheck is the container HEALTHCHECK entrypoint (distroless has no
// shell/curl): `pam-ssh-gateway -healthcheck` probes its own /healthz.
func selfHealthcheck() int {
	port := listenAddr
	if strings.HasPrefix(port, ":") {
		port = "127.0.0.1" + port
	}
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get("http://" + port + "/healthz")
	if err != nil {
		return 1
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return 1
	}
	return 0
}

func main() {
	if len(os.Args) > 1 && os.Args[1] == "-healthcheck" {
		os.Exit(selfHealthcheck())
	}

	jwtSecret = resolveSecret("NUXT_JWT_SECRET")
	if jwtSecret == "" {
		log.Fatal("[gateway] NUXT_JWT_SECRET (or NUXT_JWT_SECRET_FILE) is required")
	}
	allowedOrigins = splitCSV(env("PAM_GATEWAY_ALLOWED_ORIGINS", ""))
	if khf := os.Getenv("PAM_KNOWN_HOSTS_FILE"); khf != "" {
		if data, err := os.ReadFile(khf); err == nil {
			knownHosts = parseKnownHosts(data)
			log.Printf("[gateway] loaded %d known hosts", len(knownHosts))
		} else {
			log.Printf("[gateway] WARNING: cannot read PAM_KNOWN_HOSTS_FILE: %v", err)
		}
	}
	if knownHosts == nil {
		knownHosts = map[string]map[string]bool{}
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/session", handleSession)
	mux.HandleFunc("/healthz", handleHealthz)
	mux.HandleFunc("/readyz", handleReadyz)

	srv := &http.Server{Addr: listenAddr, Handler: mux}

	go func() {
		log.Printf("[gateway] PAM SSH gateway listening on %s (control plane %s, tofu=%v)", listenAddr, controlPlaneURL, tofu)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[gateway] listen error: %v", err)
		}
	}()

	// Graceful drain on SIGTERM/SIGINT.
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT)
	<-sigCh
	atomic.StoreInt32(&draining, 1)
	log.Printf("[gateway] draining up to %ds (active=%d)…", drainSeconds, atomic.LoadInt64(&activeSessions))
	deadline := time.Now().Add(time.Duration(drainSeconds) * time.Second)
	for atomic.LoadInt64(&activeSessions) > 0 && time.Now().Before(deadline) {
		time.Sleep(500 * time.Millisecond)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
	log.Printf("[gateway] shutdown complete")
}

func splitCSV(s string) []string {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if t := strings.TrimSpace(p); t != "" {
			out = append(out, t)
		}
	}
	return out
}
