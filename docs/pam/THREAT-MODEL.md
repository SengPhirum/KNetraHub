# KNetraHub PAM — Threat Model & Data Flows

## Assets

1. **Target credentials** (passwords, SSH keys, API/cloud keys) — the crown jewels.
2. **Application/workload secrets.**
3. **The master key (KEK)** — compromise exposes every vaulted value.
4. **Session recordings** — sensitive operational content.
5. **The audit trail** — its integrity is itself an asset.

## Trust boundaries

```
 Untrusted        │ Semi-trusted            │ Trusted (control plane)      │ Isolated sidecars
 (end user browser)│ (KNetraHub session)    │ (Nitro server + Postgres)    │ (gateway/runner, internal net)
──────────────────┼─────────────────────────┼──────────────────────────────┼───────────────────────────────
 request/reveal    │ portal auth cookie      │ tier→safe→policy→grant→MFA    │ SSH gateway holds creds only
 gateway WS        │ short-lived gw token    │ vault seal/open (KEK secret)  │ transiently, in-memory
 app token (SDK)   │ app-identity token      │ hash-chained audit + ckpts    │ connector-runner: no docker sock
```

The **browser never receives a target credential** for a brokered session — the
gateway checks it out server-side over the internal overlay and injects it.

## Primary data flows

**Credential reveal (guarded):** user → `POST accounts/:id/reveal` → tier check
(`pam.account.reveal`) → safe `reveal_credential` → active approved grant
(non-admin) → step-up security password (critical/high) → `open()` DEK-unwrap →
lease + high-severity audit event → `no-store` response with display TTL +
watermark → optional post-view rotation job.

**Brokered SSH session:** user → `POST sessions` (grant + source-network +
concurrency checks) → issue audience-scoped gateway token → browser WS to
`pam-ssh-gateway?token=…` → gateway verifies token → `POST gateway/checkout`
(re-evaluates grant, returns creds to the gateway ONLY) → SSH to target →
stream + record asciicast + extract commands → `POST gateway/ingest` (events,
command log, recording checksum+signature) → terminate on idle/max/revoke.

**Application secret retrieval:** workload → `POST secrets/retrieve` with
`Bearer pam_…` → token hash lookup → `secret_policies` authorization → `open()` →
lease + audit (actor `app:<name>`) → `no-store` value. Excess volume raises a
risk event.

## Threats & mitigations

| Threat | Mitigation |
|---|---|
| Credential theft at rest | Envelope encryption; only ciphertext persisted; no plaintext/keys/reversible checksums in DB or logs |
| KEK compromise | Secret-only master key; versioning + online rewrap; fingerprint mismatch detection; fail-closed |
| Ciphertext tampering | AES-256-GCM auth tag → `open()` throws on tamper |
| Stolen session cookie used to destroy/reveal | Step-up security password (works for SSO too) on critical actions; server-side, not UI-only |
| Privilege escalation via UI | Every API re-checks tier + safe permission + policy; frontend is UX-only |
| Self-approval / collusion | No self-approval unless policy-explicit; separation-of-duties; multi-level approval |
| Bypassing approval to reveal/connect | Non-admins require an active approved grant; reveal/connect fail closed without one |
| Credential leaked to browser in a session | Gateway checkout is token-auth on the internal net; browser has no path to it |
| Audit tampering by a DBA | Hash chain + signed checkpoints; any edit/delete breaks verification (unit-tested) |
| Recording tampering | Per-object checksum + keyed HMAC signature; integrity verification |
| Malicious custom connector | Runs only in the out-of-process runner (worker thread, mem cap, timeout, no docker socket, read-only fs, dropped caps); trusted allowlist |
| Command injection in connectors | Structured args + identifier/literal escaping (e.g. PostgreSQL `ALTER ROLE`); never string concat of untrusted input |
| Replay of gateway token | Audience-scoped, 5-minute TTL, bound to a specific session |
| Break-glass abuse | Distinct workflow (never a converted rejection); step-up + incident + alerts + mandatory recording + forced post-use rotation + review |
| JIT entitlement left standing | Expiry sweep; ret/alert on revoke failure (critical); reconcile to confirm removal |
| Secret exfiltration by an app token | Per-policy scoping (secret/path), lease TTL, one-time option, volume anomaly detection |

## Residual risks / externally constrained

- SSH host-key pinning is `InsecureIgnoreHostKey` in the reference gateway — wire a `known_hosts` store for production.
- OS/network/cloud credential change requires the connector-runner + real transports; not exercisable without those targets.
- Browser RDP/VNC requires guacd + the KNetraHub authorization adapter deployment.
- mTLS between sidecars is expected to be provisioned via the gateway TLS secrets in production.
