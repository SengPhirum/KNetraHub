package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func sign(secret string, claims map[string]any) string {
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))
	pb, _ := json.Marshal(claims)
	payload := base64.RawURLEncoding.EncodeToString(pb)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(header + "." + payload))
	sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return header + "." + payload + "." + sig
}

func TestVerifyToken(t *testing.T) {
	secret := "test-secret"
	now := time.Now().Unix()
	valid := sign(secret, map[string]any{"aud": audience, "exp": now + 300, "sessionId": "s1", "user": "alice", "jti": "j1"})

	c, err := verifyToken(valid, secret)
	if err != nil {
		t.Fatalf("valid token rejected: %v", err)
	}
	if c.SessionID != "s1" || c.User != "alice" || c.Jti != "j1" {
		t.Fatalf("claims not parsed: %+v", c)
	}

	if _, err := verifyToken(valid, "wrong-secret"); err == nil {
		t.Fatal("expected bad signature under wrong secret")
	}
	if _, err := verifyToken(sign(secret, map[string]any{"aud": audience, "exp": now - 10}), secret); err == nil {
		t.Fatal("expected expired token rejection")
	}
	if _, err := verifyToken(sign(secret, map[string]any{"aud": "other", "exp": now + 300}), secret); err == nil {
		t.Fatal("expected wrong-audience rejection")
	}
	if _, err := verifyToken(valid, ""); err == nil {
		t.Fatal("expected rejection when gateway has no secret")
	}
	if _, err := verifyToken("not.a.jwt.token", secret); err == nil {
		t.Fatal("expected malformed token rejection")
	}
}

func TestResolveSecret(t *testing.T) {
	dir := t.TempDir()
	fp := filepath.Join(dir, "jwt")
	if err := os.WriteFile(fp, []byte("  file-secret\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	os.Setenv("TESTSEC_FILE", fp)
	defer os.Unsetenv("TESTSEC_FILE")
	if got := resolveSecret("TESTSEC"); got != "file-secret" {
		t.Fatalf("expected trimmed file secret, got %q", got)
	}
	os.Unsetenv("TESTSEC_FILE")
	os.Setenv("TESTSEC", "env-secret")
	defer os.Unsetenv("TESTSEC")
	if got := resolveSecret("TESTSEC"); got != "env-secret" {
		t.Fatalf("expected env secret, got %q", got)
	}
}

func TestHostKeyVerdict(t *testing.T) {
	known := map[string]map[string]bool{"host-a": {"FP_GOOD": true}}
	if ok, _ := hostKeyVerdict(known, "host-a", "FP_GOOD", false); !ok {
		t.Fatal("known matching key should be accepted")
	}
	if ok, _ := hostKeyVerdict(known, "HOST-A", "FP_GOOD", false); !ok {
		t.Fatal("host match should be case-insensitive")
	}
	if ok, _ := hostKeyVerdict(known, "host-a", "FP_EVIL", false); ok {
		t.Fatal("host key mismatch MUST be rejected (MITM)")
	}
	if ok, _ := hostKeyVerdict(known, "host-b", "FP_NEW", false); ok {
		t.Fatal("unknown host must be rejected by default")
	}
	if ok, _ := hostKeyVerdict(known, "host-b", "FP_NEW", true); !ok {
		t.Fatal("unknown host should be accepted under TOFU")
	}
}

func TestParseKnownHosts(t *testing.T) {
	data := []byte("# comment\nhost-a FP1\nhost-a FP2\nHOST-B fpB\n\nbad-line\n")
	kh := parseKnownHosts(data)
	if !kh["host-a"]["FP1"] || !kh["host-a"]["FP2"] {
		t.Fatalf("host-a fingerprints missing: %+v", kh["host-a"])
	}
	if !kh["host-b"]["fpB"] {
		t.Fatalf("host-b lowercased key missing: %+v", kh)
	}
	if _, ok := kh["bad-line"]; ok {
		t.Fatal("single-field line should be ignored")
	}
}

func TestOriginAllowed(t *testing.T) {
	if !originAllowed("", nil) {
		t.Fatal("empty origin / no allowlist should pass (internal network)")
	}
	if !originAllowed("https://portal.example", []string{"https://portal.example"}) {
		t.Fatal("listed origin should pass")
	}
	if originAllowed("https://evil.example", []string{"https://portal.example"}) {
		t.Fatal("unlisted origin must be rejected when an allowlist is set")
	}
}
