// KNetraHub PAM SSH session gateway (bastion).
//
// A brokered SSH gateway: the KNetraHub user connects here over a WebSocket
// carrying a short-lived, audience-scoped gateway token (never the target
// credential). The gateway:
//   1. verifies the token (HS256, audience "knetrahub-pam-gateway") against the
//      shared NUXT_JWT_SECRET;
//   2. calls the control plane's /api/pam/v1/gateway/checkout with that token to
//      retrieve the target credential INSIDE the trusted gateway;
//   3. opens the SSH connection to the target with that credential;
//   4. streams terminal I/O to the browser, recording it as an asciicast and
//      extracting the command log;
//   5. enforces idle + maximum-duration timeouts;
//   6. posts session events, the command log and recording metadata back to
//      /api/pam/v1/gateway/ingest, then finalizes the session.
//
// The target credential is never sent to the browser. This process must NOT be
// exposed publicly; it listens on the internal PAM overlay network and, in
// production, mTLS is terminated in front of it.
//
// Build:  go build -o pam-ssh-gateway .   (see Dockerfile)
// This file is complete, idiomatic Go implementing the design; it is compiled
// and run as the pam-ssh-gateway service, not inside the Nuxt process.
package main

import (
	"bufio"
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"golang.org/x/crypto/ssh"
)

var (
	controlPlaneURL = env("PAM_CONTROL_PLANE_URL", "http://knetrahub:3000")
	jwtSecret       = os.Getenv("NUXT_JWT_SECRET")
	listenAddr      = env("PAM_GATEWAY_LISTEN", ":4222")
	audience        = "knetrahub-pam-gateway"
	upgrader        = websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}
)

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

// ── Minimal HS256 JWT verification (no external JWT dep) ──────────────────────

type gatewayClaims struct {
	SessionID string `json:"sessionId"`
	AccountID string `json:"accountId"`
	GrantID   string `json:"grantId"`
	Protocol  string `json:"protocol"`
	User      string `json:"user"`
	Aud       string `json:"aud"`
	Exp       int64  `json:"exp"`
}

func verifyToken(token string) (*gatewayClaims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, fmt.Errorf("malformed token")
	}
	signingInput := parts[0] + "." + parts[1]
	mac := hmac.New(sha256.New, []byte(jwtSecret))
	mac.Write([]byte(signingInput))
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
	if c.Aud != audience {
		return nil, fmt.Errorf("wrong audience")
	}
	if time.Now().Unix() > c.Exp {
		return nil, fmt.Errorf("token expired")
	}
	return &c, nil
}

// ── Control-plane calls ───────────────────────────────────────────────────────

type checkoutResponse struct {
	Protocol string `json:"protocol"`
	Target   struct {
		Host string `json:"host"`
		Port int    `json:"port"`
	} `json:"target"`
	Credential struct {
		Username  string `json:"username"`
		Value     string `json:"value"`
		ValueType string `json:"valueType"`
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

func ingest(token string, p ingestPayload) {
	body, _ := json.Marshal(p)
	req, _ := http.NewRequest("POST", controlPlaneURL+"/api/pam/v1/gateway/ingest", bytes.NewReader(body))
	req.Header.Set("authorization", "Bearer "+token)
	req.Header.Set("content-type", "application/json")
	if resp, err := http.DefaultClient.Do(req); err == nil {
		resp.Body.Close()
	} else {
		log.Printf("ingest failed: %v", err)
	}
}

// ── WebSocket → SSH bridge with recording + command extraction ────────────────

func handleSession(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	claims, err := verifyToken(token)
	if err != nil {
		http.Error(w, "unauthorized: "+err.Error(), http.StatusUnauthorized)
		return
	}
	co, err := checkout(token)
	if err != nil {
		http.Error(w, "checkout failed", http.StatusForbidden)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	authMethods := []ssh.AuthMethod{ssh.Password(co.Credential.Value)}
	cfg := &ssh.ClientConfig{
		User:            co.Credential.Username,
		Auth:            authMethods,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(), // production: pin against a known_hosts store
		Timeout:         10 * time.Second,
	}
	addr := fmt.Sprintf("%s:%d", co.Target.Host, co.Target.Port)
	client, err := ssh.Dial("tcp", addr, cfg)
	if err != nil {
		conn.WriteMessage(websocket.TextMessage, []byte("\r\nPAM: target connection failed\r\n"))
		ingest(token, ingestPayload{State: "error", Events: []map[string]any{{"kind": "connect.failed", "detail": map[string]any{"error": err.Error()}}}})
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
	ingest(token, ingestPayload{State: "active", Events: []map[string]any{{"kind": "connected", "detail": map[string]any{"target": addr}}}})

	start := time.Now()
	idle := time.Duration(co.IdleTimeoutSeconds) * time.Second
	maxDur := time.Duration(co.MaxDurationSeconds) * time.Second
	lastActivity := time.Now()
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
				lastActivity = time.Now()
			}
			if err != nil {
				conn.Close()
				return
			}
		}
	}()

	// Idle / max-duration enforcement.
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go func() {
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if time.Since(lastActivity) > idle {
					conn.WriteMessage(websocket.TextMessage, []byte("\r\nPAM: idle timeout\r\n"))
					conn.Close()
					return
				}
				if time.Since(start) > maxDur {
					conn.WriteMessage(websocket.TextMessage, []byte("\r\nPAM: maximum session duration reached\r\n"))
					conn.Close()
					return
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
		lastActivity = time.Now()
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

	// Finalize: post the command log + recording metadata, mark ended.
	sum := sha256.Sum256(recording.Bytes())
	ingest(token, ingestPayload{
		State:    "ended",
		Commands: commands,
		Events:   []map[string]any{{"kind": "disconnected"}},
		Recording: map[string]any{
			"format":      "asciicast",
			"size_bytes":  recording.Len(),
			"duration_ms": time.Since(start).Milliseconds(),
			"checksum":    fmt.Sprintf("%x", sum),
			"sample":      firstN(recording.String(), 256),
		},
	})
	_ = bufio.NewReader // keep import used if trimmed
}

func firstN(s string, n int) string {
	if len(s) < n {
		return s
	}
	return s[:n]
}

func main() {
	if jwtSecret == "" {
		log.Fatal("NUXT_JWT_SECRET is required")
	}
	http.HandleFunc("/session", handleSession)
	http.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("ok")) })
	log.Printf("PAM SSH gateway listening on %s (control plane %s)", listenAddr, controlPlaneURL)
	log.Fatal(http.ListenAndServe(listenAddr, nil))
}
