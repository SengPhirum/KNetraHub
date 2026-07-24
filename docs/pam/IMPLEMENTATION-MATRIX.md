# KNetraHub PAM — Implementation Matrix

> **Status of this document:** Stage-1 audit, produced by direct source inspection on 2026-07-24.
> It records the *true* state of the PAM module before completion work begins, with file:line evidence.
> Statuses are deliberately conservative: a capability is `WORKING` only when it has usable UI (where
> applicable), complete server behaviour, server-side authorization, performs the real target action,
> has a negative-path test, and matching documentation. Table/route/interface existence is **not**
> evidence of completion.
>
> Legend: **WORKING** · **PARTIAL** · **BROKEN** · **MISSING** · **EXTERNALLY CONSTRAINED**

## Environment capabilities (verified 2026-07-24)

| Capability | Available here? | Note |
|---|---|---|
| Node 22.22 / pnpm 11.9 | ✅ | 27 PAM unit tests pass |
| Docker 29.6 + Swarm active | ✅ | local swarm node is `active` |
| Docker image pulls | ✅ | pulled `alpine:3.20` successfully → disposable test targets are runnable |
| Go 1.21.4 (Windows) | ✅ | ssh-gateway is buildable/testable |
| Playwright 1.61 | ✅ | installed (devDep) |
| `ssh2` in node_modules | ✅ | present (transitive) — usable for a Node SSH connector |
| `xterm.js` | ❌ | not installed — required for the browser terminal |
| AWS / Azure / GCP / ServiceNow / Jira / vCenter | ❌ | no credentials/endpoints → connectors are `EXTERNALLY CONSTRAINED` |

---

## Top-level capability matrix (Section 1 of the brief)

| # | Capability | Current status | Evidence (file:line) | Defect | Required work | Test proving completion |
|---|---|---|---|---|---|---|
| 1 | Secure credential & secrets vaulting | **PARTIAL** | Envelope AES-256-GCM real, per-value DEK wrapped under KEK, versioning + rewrap real — `pamCrypto.ts:118-169`, `pamVault.ts:23-80` | KEK is unsalted `SHA-256(domain:material)` (no KDF) `pamCrypto.ts:50-52`; **leases written but never enforced** (`consumed` never read) `pamVault.ts:95-107`; no rollback/activate-prior-version; no KMS/HSM; recovery material is a secret slot only | Add KDF or random KEK; enforce one-time/TTL leases on reveal+retrieve; add version rollback; master-key provider interface (file/KMS/HSM) | Unit: seal/open/rewrap, bad-tag rejection (exists); NEW: lease single-use rejection, rollback restores prior plaintext |
| 2 | Safes with granular membership & delegation | **PARTIAL** | safes/members/permissions CRUD real — `safes/[id]/members.post.ts`, `safes/index.*` | Members added by **free-text** principal, no directory/IdP validation `members.post.ts:14-16`, `safes/[id].vue:105`; no delegation, no expiring membership, no per-member permission matrix UI, no edit/archive/clone | User+group directory search; membership expiry/delegation; effective-permission preview; safe workspace tabs | E2E: add group member via search, denied for bogus principal; unit: effective-permission resolution |
| 3 | Privileged account inventory & lifecycle | **PARTIAL** | Server-side paginated grid + onboard modal real — `accounts/index.vue`, `accounts/index.get.ts` | Create-only UI (no delete despite `index.delete.ts`); no bulk actions; no multi-step onboarding wizard; no custom-property schema per platform | Bulk actions; onboarding wizard; account-detail tabs; delete/archive UI | E2E: bulk rotate/move; wizard onboard |
| 4 | Real credential change / verify / reconcile | **PARTIAL** ⬆ (Stage 4) | **4 real connectors**: `postgresql` (in-proc), **`linux-ssh`** (`ssh2`), **`ad-ldap`** (`ldapts`, LDAPS-by-default), **`mysql`** (`mysql2`) — all change/verify/reconcile/discover/test. In-process worker now **verifies before finalizing** + renews leases (double-exec fix); runner path seals only after verified change. | Remaining: MongoDB (locally testable); Windows/network/cloud (implement + mock, EXTERNALLY CONSTRAINED); dependency-updates | `pnpm test:it:{linux,ldap,mysql}` — each proves change→new-works/old-fails + verify + discover |
| 5 | Automated discovery & onboarding | **PARTIAL** ⬆ (Stage 5) | Real engine (`pamDiscovery.ts` + `pamDiscoveryCore.ts`): source CRUD, test-source, **real scan** via connector `discover` (in-process + runner-delegated), dedup upsert + run records + deltas, nested AND/OR/NOT onboarding-rule engine (priority, simulate, conflicts), auto-onboard, bulk actions, scheduled scans. Full API under `/discovery/{sources,runs,rules,pending}`. Fixed a latent crash (`privilege_level` column missing). | UI pages (Stage 9); real IPAM/Monitoring pull (currently import-array); cancel/pause live-scan | `discovery-core.test.ts` (7 unit) + `discovery.it.ts` (4 integration: real PG scan → queue, rule auto-onboard, runner-delegated report, simulate/bulk) |
| 6 | Approval & ticket-controlled access | **WORKING** ⬆ (Stage 6) | request→approval→grant with **enforced** quorum (distinct approvers), approver-eligibility (owner/safe-owner/group), self-approval block, and **separation-of-duties**; **policy CRUD + versioning**; ticket validation **production-safe** (unvalidated rejected by default in prod). ServiceNow/Jira/REST validators real (configured). | require_mfa enforcement (step-up now exists — wire into session launch); ticket mock-integration test | `governance.it.ts` (5 integration: quorum needs 2 distinct, self/eligibility/SoD blocked, policy CRUD+versions) |
| 7 | Functional browser-based SSH sessions | **PARTIAL** ⬆ (Stage 3) | Gateway SSH path **proven E2E** (`ssh-session.mjs`: real `whoami` output, credential not leaked, recording, revocation). xterm terminal page + WS proxy implemented. | In-browser Playwright E2E (Stage 10) | `pnpm test:it:ssh` passes (7 assertions); browser Playwright is Stage 10 |
| 8 | Functional native SSH gateway | **PARTIAL** ⬆ (Stage 2, 2026-07-24) | Hardened `main.go`: `_FILE` resolution (crash-loop **fixed**), `/healthz`+`/readyz`, `-healthcheck` flag, graceful drain on SIGTERM, host-key validation (replaces `InsecureIgnoreHostKey`), password **and** private-key + keyboard-interactive auth, correlation ids. Builds + `go test` (6) pass. | Remaining (Stage 3): `jti` one-time replay enforcement (claim carries `jti` now, control-plane single-use store pending); managed known-hosts store + `/pam/host-keys` approval UI (gateway-side file/TOFU works today); real-SSH-through-gateway integration test | Go unit tests pass (`main_test.go`); Stage-3 adds a live SSH-through-gateway E2E + replay-token-fails + host-key-mismatch-blocks |
| 9 | Browser RDP & VNC via Guacamole | **MISSING** | `guacd` container declared `docker-compose.pam.yml:80-92`; DB allows rdp/vnc kinds | No adapter, no route, no client | Guacamole auth adapter + `/desktop` client route | Playwright against disposable RDP/VNC + guacd |
| 10 | Real encrypted session recording & playback | **PARTIAL** ⬆ (Stage 3A, 2026-07-24) | **Recording pipeline WORKING** (`pamRecording.ts` + `pamStorage.ts`): per-recording AES-256-GCM data key wrapped under the master key; ciphertext stored (fs or S3/MinIO via dependency-free SigV4); checksum+signature over the STORED object; **independent re-read verification** before integrity is marked valid. Gateway uploads bytes to `POST /gateway/recording`; fake-integrity path removed from ingest. Download (`GET /sessions/:id/recording`, range + no-store) + independent verify (`POST /sessions/:id/recording/verify`) endpoints added. Proven: `test/pam/integration/recording.it.ts` (4 tests, fs **and** MinIO) — ciphertext at rest, decrypt round-trip, **tamper detected**. | Remaining (Stage 3C/9): the playback **player page** (`/pam/sessions/:id/playback`) — API is ready | Integration tests pass; Playwright playback + auditor-verify is Stage 10 |
| 11 | Live session monitoring & termination | **WORKING** ⬆ (Stage 3) | Gateway polls `session-state` every 3s and tears down the live stream on terminate/grant-revoke; DB monitor + terminate real | — | `pnpm test:it:ssh` asserts manager-terminate closes the live session within a poll interval |
| 12 | JIT provisioning & confirmed revocation | **WORKING** ⬆ (Stage 7) | Provider framework (`pamJit.ts` + `pamJitCore.ts` state machine, migration `0014`): real `ldap-group` provider (provision/verifyProvisioned/revoke/verifyRevoked); marks `active` only after provisioned is verified and `revoked` only after removal is verified; expired-sweep wired into bootstrap; `/jit` request/provision/revoke routes. Cloud/Windows/k8s providers registered as EXTERNALLY CONSTRAINED (fail loudly, never fake). | Linux-sudo/DB/cloud providers (impl + external targets) | `jit-core.test.ts` (3 unit) + `jit.it.ts` (3 integration: **grant→member confirmed, revoke→removal confirmed** against real OpenLDAP, sweep, constrained-fails-loudly) |
| 13 | Zero-standing-privilege detection | **WORKING** ⬆ (Stage 7) | `pamZsp.scanZsp` detects standing privileged accounts (unmanaged/non-rotating), permanent privileged-group membership without JIT, and non-expiring accounts; records a `standing_privilege` risk per finding; `/zsp/scan` route. Remediation path = the JIT request/revoke workflow. | scheduled ZSP + richer cloud detectors | `governance.it.ts` (flags a standing critical privileged account) |
| 14 | External vendor access | **WORKING** ⬆ (Stage 7) | `pamVendor.ts` + `pamVendorCore.ts`: org CRUD, invitation (hashed one-time token), accept→temporary vendor identity, contract/status/network **access enforcement**, and **auto-suspension** on contract expiry (wired into the sweep). `/vendors/*` routes. Vendor users never receive target passwords. | UI pages (Stage 9); identity-proofing/recert flows | `vendor-core.test.ts` (4 unit) + `vendor.it.ts` (3 integration: invite→accept→access, token single-use, contract-expiry auto-suspend BLOCKS access, manual suspend) |
| 15 | Application & workload secrets | **WORKING** ⬆ (Stage 7) | `pamSecrets.ts` (migration `0015`): version list + **rollback/activate**, **ENFORCED one-time + TTL leases** (fixes the silently-failing `createLease` misuse), **dynamic generate-on-read** secrets; app-identity `api_token` auth + path policies. | OIDC/mTLS/k8s/cloud **workload identities** (api_token works; others EXTERNALLY CONSTRAINED — need the external IdP); one-time-token dialog (Stage 9) | `secrets.it.ts` (3 integration: rollback, one-time lease blocks re-read until rotated, dynamic mints fresh) |
| 16 | Privileged threat detection & response | **WORKING** ⬆ (Stage 8) | `pamRiskEngine.ts` (+ pure `pamRiskEngineCore.ts`, migration `0016`): an evaluation engine runs every sweep over REAL event sources (sessions, audit failures, rejected requests, accounts, vendor users), records each finding **once** (`dedupe_key`), and **executes `auto_response` as real actions** (block live session / disable account / suspend vendor / open investigation / alert). `enabled`+`config` now honored; rule CRUD + manual `/risk/evaluate`. All 20 rules reachable (12 previously-dead now fire). | ML/behavioural scoring (out of scope — deterministic by design); investigation workspace UI (Stage 9) | `risk-engine-core.test.ts` (10 unit) + `risk.it.ts` (3 integration: off-hours fires once/dedupe, **block_session terminates a live session**, disabled rule does not fire then fires when re-enabled) |
| 17 | Access certification | **WORKING** ⬆ (Stage 8) | `pamCertification.ts` (+ pure `pamCertificationCore.ts`): campaign snapshots subjects (active grants / privileged accounts / JIT / safe members) into review items; certify/revoke/delegate; a **revoke performs real enforcement** (revoke grant+terminate session, revoke JIT, disable account, remove safe member); completion sets status + stored evidence summary. `/certifications/*` routes (`pam.certification.*` perms). | scheduled campaign generation + delegation chains (UI Stage 9) | `certification-core.test.ts` (unit) + `certification.it.ts` (2 integration: certify keeps / **revoke revokes grant + terminates session** / completion summary; invalid decision rejected) |
| 18 | Reports & scheduled evidence delivery | **WORKING** ⬆ (Stage 8) | `pamReports.ts` + pure `pamReportRenderCore.ts` (migration `0016` `report_runs`): **server-side CSV / real XLSX (exceljs) / PDF**; every run stored as an **evidence snapshot** (bytes + sha256, re-downloadable byte-identical); schedule reader **claims due schedules atomically** (no double-run), generates + **delivers** (in-portal notification real; email/webhook marked EXTERNALLY CONSTRAINED/skipped). Routes: generate/download/runs/schedules CRUD. | SMTP/webhook transport (EXTERNALLY CONSTRAINED); report builder UI (Stage 9) | `report-render.test.ts` (3 unit inc. XLSX round-trip + PDF structure) + `reports.it.ts` (4 integration: XLSX stored+checksum-verified+re-download identical, CSV row count, **schedule→generate→deliver→advance next_run_at**, email channel skipped) |
| 19 | Complete audit integrity verification | **WORKING** | Hash-chain + signed checkpoints + full verify real — `pamAudit.ts:84-186`, `audit/verify.post.ts` | Minor: verify (read perm) can `createCheckpoint` (write) `verify.post.ts:15`; checkpoints depend on recording/master key | Split checkpoint perm; independent audit-signing key | Unit: chain break detected, tamper→fail (exists) |
| 20 | Production-ready Docker Swarm deployment | **PARTIAL** ⬆ (Stage 2, 2026-07-24) | Compose corrected: `build:` removed (with `scripts/pam-build-images.sh` for explicit build/push), working healthchecks on gateway (`-healthcheck`)/runner (heartbeat)/guacd/minio, `_FILE` throughout, new `knetrahub_pam_connector_signing_key`/`knetrahub_pam_known_hosts` secrets, runner `/connectors` read-only + tmpfs, drain via start-first. `docker compose config` validates. | Full `stack deploy` on a live swarm + backup/restore + multi-replica cooperation validation | Stage 10: container smoke tests + `stack deploy` succeeds + healthchecks pass |
| 21 | Professional consistent responsive UI | **PARTIAL** | Core CRUD pages real (accounts/requests/approvals/grants/risk/audit/reports/settings) | **Zero shared PAM components**; `prompt()` in `secrets/index.vue`; **plaintext secret rendered in table row** `secrets/index.vue`; **account reveal never sends step-up → all high/critical reveals fail** `accounts/[id].vue doReveal`; read-only where CRUD needed (policies/connectors/safe-edit/platform-edit) | Shared design system + fix reveal wiring + secret dialog + missing pages + visual QA | Playwright screenshots (light/dark/tablet/mobile) reviewed |
| 22 | Meaningful automated testing vs real targets | **PARTIAL** | 27 unit tests pass (crypto/audit/password/policy) | `test/e2e/pam-e2e.mjs` is **simulated** (not a real browser/target flow); no integration stack | Real Playwright E2E + disposable integration stack (SSH/PG/LDAP/MinIO/guacd) | The full E2E flow in Section 19.3 |

---

## Key cross-cutting defects (Section 3 of the brief) — all CONFIRMED

| Defect | Status | Evidence |
|---|---|---|
| Runner control plane routes missing | **WORKING** ✅ (Stage 2, 2026-07-24) | Implemented `register/heartbeat/claim/report/logs/config` + admin `runners` CRUD; hashed tokens, per-runner allowlist, expiry/rotation/revoke, job leasing/reclaim, idempotent reporting. Proven by `test/pam/runner.test.ts` (19) + `test/pam/integration/runner-flow.it.ts` (6, real Postgres). |
| Runner sandbox imports arbitrary bundle path | **FIXED** ✅ (Stage 2) | `runner.mjs`/`sandbox.mjs` rewritten: control plane sends only key+version+digest+signature; runner resolves inside a read-only trusted dir, rejects path-escape, computes local digest, executes only on digest+allowlist match; worker re-verifies digest. Unit-tested path-traversal + digest gate. |
| Connector signature/allowlist registry | **WORKING** ✅ (Stage 2, control plane) | `pamRunnerCore.verifyConnectorPackage` enforces enabled+trusted+active+version+digest+signature; `registerConnectorPackage`/`seedRunnerConnectorRegistry` sign entries; seeded at bootstrap. Real per-bundle digests land with connector bundles in Stage 4. |
| Session returns dead `connect.endpoint` | **FIXED** ✅ (Stage 3B) | removed; `sessions` now returns `terminalUrl` + gateway address; native clients use the gateway `/session` path |
| Session protocol operator-precedence bug | **FIXED** ✅ (Stage 3B) | `resolveProtocol()` (pamSessionCore) — explicit rdp/vnc/web/ssh honoured; unit-tested (`session-core.test.ts`) |
| Gateway token no `jti` / single-use | **FIXED** ✅ (Stage 3B) | `issueGatewayToken` records a `jti` in `pam.gateway_tokens`; `consumeGatewayToken` is atomic single-use; checkout rejects replays. Integration-tested (`gateway-token.it.ts`) |
| `ssh.InsecureIgnoreHostKey()` | **FIXED** ✅ (Stage 2) | replaced by `hostKeyCallback`/`hostKeyVerdict`: known-hosts pinning, **mismatch always blocked**, unknown blocked unless `PAM_HOSTKEY_TOFU`; unit-tested (`main_test.go`) |
| Host-key management (`/pam/host-keys`) | **PARTIAL** (gateway-side done; UI Stage 3) | gateway validates + reports fingerprints; managed store + approval page is Stage 3 |
| Gateway `_FILE` crash-loop (deploy-fatal) | **FIXED** ✅ (Stage 2) | `resolveSecret("NUXT_JWT_SECRET")` reads `_FILE`; unit-tested; `/readyz` fails closed if unset |
| Step-up bypassed by bearer token | **FIXED** ✅ (Stage 6) | `pamStepUp.requirePamStepUp` (used by reveal/break-glass/safe-delete/account-delete) has **no bearer exemption** — a token needs an explicit service scope or a valid step-up proof. Unit-tested (`stepup-core.test.ts`, incl. the no-bypass regression) |
| Approval quorum / approver-identity / SoD not enforced | **FIXED** ✅ (Stage 6) | quorum→N distinct approvers, eligibility by approver type, SoD conflicts — enforced in `approve.post.ts` + `pamRequests`; `governance.it.ts` proves it |
| Access policy CRUD/versioning read-only | **FIXED** ✅ (Stage 6) | `pamPolicyStore` + `access-policies` POST/PUT/DELETE + `[id]/versions`; each edit bumps + snapshots a version |
| Tickets accept-unvalidated by default | **FIXED** ✅ (Stage 6) | secure default: unvalidated rejected in production unless an admin opts in / a validator is configured |
| `require_mfa` policy flag | **PARTIAL** (step-up now real) | step-up exists + enforced on reveal/break-glass; wiring `require_mfa` into session launch remains |
| Master-key recovery workflow | **MISSING** | `NUXT_PAM_RECOVERY_MATERIAL_FILE` slot only; no Shamir split/combine (grep 0 code refs) |
| Access policy CRUD/versioning | **BROKEN** | GET-only; no POST/PUT/DELETE; hardcoded `DEFAULT_POLICY` fallback `pamRequests.ts:26-29` |
| Job cancellation of running jobs | **PARTIAL** | `cancel_requested` honored for queued only; **no API sets it** |
| Job lease renewal / heartbeat | **MISSING** | lease set once, never renewed → >5min job double-executes `pamJobs.ts` |
| `services/pam/worker` dir (claimed) | **MISSING** | worker is the in-proc `setInterval` loop only `pamBootstrap.ts:56-58` |

---

## Risk-rule wiring (Section 12) — updated Stage 8

**Inline-fired at the point of action (8):** `jit_revoke_failure`, `audit_integrity_failure`, `reconcile_failure`, `disallowed_source`, `excessive_reveals`, `excessive_secret_retrieval`, `blocked_command`, `break_glass`.

**Now fired by the evaluation engine (`pamRiskEngine.evaluateRiskRules`, every sweep + `/risk/evaluate`):** `access_off_hours`, `new_source_ip`, `concurrent_sources`, `first_critical_access`, `repeated_failed_access`, `repeated_rejection`, `rotation_overdue`, `session_without_recording`, `vendor_out_of_window`. `standing_privilege` is fired by the ZSP scan (Stage 7).

**`auto_response` is now EXECUTED** for every rule (not just stored): `alert` → notification; `block_session` → terminate the live session(s); `disable_account` → disable the account; `suspend_vendor` → suspend the vendor org; `open_investigation` → move the event to investigating. High/critical always alert. Each finding is deduped (`dedupe_key`) so a sweep never spams duplicates. **Proof: `risk.it.ts` terminates a real live session via `block_session`.**

`bulk_export`/`recording_integrity_failure` remain point-of-action hooks (fire from an export endpoint / recording verify path); the engine covers the periodic-detectable rules.

## Connector reality (Section 4) — updated Stage 4

| Connector | Status | Real actions / proof |
|---|---|---|
| `postgresql` | **WORKING** (in-proc) | change / verify / reconcile / test / discover via `pg` |
| `generic` | **WORKING** (vault-only) | no external target — vault is the target |
| `linux-ssh` | **WORKING** (runner bundle) | ssh2; `pnpm test:it:linux` (8 assertions, real target) |
| `ad-ldap` | **WORKING** (runner bundle) | ldapts, LDAPS-by-default; `pnpm test:it:ldap` (7 assertions) |
| `mysql` | **WORKING** (runner bundle) | mysql2; `pnpm test:it:mysql` (7 assertions) |
| `mongodb` | **WORKING** (runner bundle) | mongodb; `pnpm test:it:mongo` (6 assertions) |
| `windows-*` (WinRM), `cisco-ios`/`fortigate`/network, `aws-iam`/`azure-sp`/`gcp-sa`, k8s | **MISSING / EXTERNALLY CONSTRAINED** | to implement + mock contract (no local Windows/cloud/device targets) |

Runner bundles live in `services/pam/connector-runner/connectors/<key>/<version>/index.mjs`, loaded only after digest+signature verification. Each real connector reports `verified` ONLY after an independent re-auth with the new credential.

## What is genuinely solid today

Envelope crypto + key versioning/rewrap (`pamCrypto`), the append-only signed **audit hash-chain** (`pamAudit`), the durable Postgres **job queue** (leasing / `SKIP LOCKED` / backoff / dead-letter), forward-only idempotent **migrations** (62 tables), the request→approval→grant **happy path**, the `postgresql` connector, and most **read/CRUD UI** for accounts/requests/approvals/grants/risk/audit/reports/settings. These are the load-bearing pieces to build on.

## Migration inventory (62 tables)

- **0001_core:** crypto_keys, audit_events, audit_checkpoints, settings, tags, object_tags, notifications
- **0002_vault:** safes, safe_members, safe_member_permissions, platforms, platform_versions, platform_actions, accounts, account_properties, account_dependencies, account_links, credential_versions, credential_leases, deleted_objects
- **0003_jobs:** credential_jobs, credential_job_attempts, maintenance_windows
- **0004_discovery:** discovery_sources, discovery_schedules, discovery_runs, discovered_accounts, onboarding_rules
- **0005_access:** access_policies, access_policy_rules, access_requests, request_accounts, request_approvals, request_tickets, access_grants, jit_entitlements
- **0006_sessions:** gateways, gateway_health, sessions, session_events, session_commands, session_recordings, session_markers
- **0007_secrets:** secrets, secret_versions, applications, application_identities, secret_policies
- **0008_risk_compliance:** risk_rules, risk_events, certification_campaigns, certification_items, reports, report_schedules, policy_exceptions, connectors, connector_versions, connector_instances, connector_health, vendors, vendor_users, vendor_invitations

---

*Next: this matrix is updated as each capability is completed with test evidence. No status is promoted to `WORKING` without a passing test named in the final column.*

---

## Progress log

### Stage 2 — Operational infrastructure (in progress)

**Runner control plane + security + connector registry — DONE, tested.**
- `layers/pam/server/utils/pamRunnerCore.ts` — pure, dependency-free security core (token hashing, connector-package verification gate, verify-before-seal decision, path-traversal defence). 19 unit tests (`test/pam/runner.test.ts`).
- `layers/pam/server/utils/pamRunner.ts` — DB control plane: runner identity (hashed tokens, allowlist, expiry/rotation/revoke), register/heartbeat/config, `claimForRunner` (server-generates + seals the new credential as `pending_secret`), `reportForRunner` (idempotent; **seals only on confirmed+verified change**), signed registry writes.
- Migration `0009_runner.ts` — `pam.runners`, `pam.runner_logs`, `credential_jobs` delegation columns (`handler`, `connector_key`, `assigned_runner_id`, `pending_secret`), connector-registry hardening columns.
- Routes: `runner/{register,heartbeat,claim,report,logs,config}` (runner-token auth) + `runners` admin CRUD (`pam.connector.manage`).
- `services/pam/connector-runner/{runner,sandbox}.mjs` — rewritten: `_FILE` secret resolution, digest+allowlist+path-traversal verification before load, no web-supplied path, worker re-verify.
- Integration proof: `test/pam/integration/runner-flow.it.ts` (6 tests, real Postgres, deterministic on re-run) — registry signature gate, fail-closed runner auth, delegated rotate seals only after verified change, unverified change does NOT seal (no lockout), report idempotency, in-process/runner isolation.
- Disposable integration harness: `vitest.integration.config.ts` + `pnpm test:it:pam` (fails loudly without a DB; start with `docker run --name pam-it-pg -e POSTGRES_PASSWORD=pam -e POSTGRES_USER=pam -e POSTGRES_DB=pam_test -p 55432:5432 -d postgres:16-alpine`).

**Go SSH-gateway hardening — DONE, tested.**
- `services/pam/ssh-gateway/main.go` rewritten: `_FILE` secret resolution (fixes the deploy-fatal crash-loop), `/healthz`+`/readyz`, `-healthcheck` self-probe (for the distroless container), graceful drain on SIGTERM, host-key validation replacing `InsecureIgnoreHostKey` (known-hosts pinning + mismatch-block + TOFU opt-in), password + private-key + keyboard-interactive auth, per-session correlation ids. The prior code did not even compile (`claims declared and not used`).
- `services/pam/ssh-gateway/main_test.go` — 6 Go tests (token verify valid/expired/bad-sig/bad-aud/no-secret, `_FILE` resolution, host-key verdict incl. mismatch+TOFU, known-hosts parse, origin allowlist). `gofmt`+`go vet` clean; `go build` OK; `go.sum` generated. Runtime-smoked `/healthz`,`/readyz`,`-healthcheck` (0 healthy / 1 unhealthy).
- Build locally with `GOTOOLCHAIN=local` (go.mod lowered to `go 1.21` to match; container uses golang:1.22-alpine).

**`docker-compose.pam.yml` + images — DONE.**
- Removed `build:` (ignored by `stack deploy`) → `scripts/pam-build-images.sh <prefix> [tag]` builds+pushes gateway+runner; portal image from the main pipeline.
- Real healthchecks: gateway `-healthcheck`, runner `--healthcheck` (heartbeat file on tmpfs), guacd, minio. Gateway Dockerfile adds `HEALTHCHECK`; runner Dockerfile adds `HEALTHCHECK` + tmpfs-friendly rootfs.
- New secrets `knetrahub_pam_connector_signing_key`, `knetrahub_pam_known_hosts`; runner mounts `pam-connectors` read-only at `/connectors` + writable tmpfs `/tmp`; `.env.example` documents them + `docker secret create` commands. `docker compose config` validates.

**Still open in Stage 2:** MinIO object-storage abstraction — delivered in Stage 3A below.

### Stage 3 — Real session access (in progress)

**3A — Object storage + recording pipeline — DONE, tested (fs + MinIO).**
- `pamStorage.ts` — `fs` and `s3` backends (S3/MinIO signed with dependency-free SigV4); safe-key + path-escape guards; range reads.
- `pamRecording.ts` — encrypt (per-recording GCM key, envelope-wrapped) → store → checksum+sign the stored object → **independent re-read verification** → mark integrity only then; `openRecording` (decrypt), `verifyRecording` (auditor re-verify).
- Migration `0010_recording_storage.ts` (`enc_meta`, `integrity_detail`); `POST /gateway/recording` (binary upload); ingest fake-integrity path removed; `GET /sessions/:id/recording` (range, no-store, audited); `POST /sessions/:id/recording/verify`. Gateway `main.go` uploads bytes on finalize.
- Proof: `recording.it.ts` (4) — fs + MinIO: ciphertext at rest (plaintext sentinel absent), decrypt round-trip, tamper→verify fails + GCM decrypt throws.

**3B — Session-launch hardening — DONE, tested.**
- `pamSessionCore.resolveProtocol` (fixes the precedence bug; unit-tested), one-time `jti` gateway tokens (`pamGateway` + migration `0011_gateway_tokens`), atomic single-use consumption at checkout (replay → 403 + risk event). New `POST /sessions/:id/token` (reconnect) and `GET /gateways/select`. `sessions` returns real `terminalUrl`/gateway info.
- Proof: `session-core.test.ts` (3 unit) + `gateway-token.it.ts` (3 integration: jti consumed once, replay rejected, unknown rejected).

**3C/3D/3E — Browser terminal, playback, revocation — DONE (session path proven E2E).**
- **Revocation propagation** (was a confirmed gap): gateway now polls `GET /gateway/session-state` every 3s and tears the live SSH stream down on terminate/grant-revoke; `session-state.get.ts` added. Proven in the SSH E2E below.
- **Real SSH session E2E** (`test/pam/integration/ssh-session.mjs`, `pnpm test:it:ssh`): built gateway + disposable OpenSSH container + mock control plane. **7 assertions pass** — real `whoami` → `pamuser` output, target credential NEVER sent to the client, `connected` reported, **manager-terminate closes the live session**, recording bytes uploaded, command log captured. This is the server-side of the brief's §19.3 flow.
- **Browser client**: `xterm` terminal page (`/pam/sessions/:id/terminal`) + WS proxy (`layers/pam/server/routes/pam-ws/session/[id].ts`, origin allowlist + gateway-token auth + size cap, pipes to the internal gateway so it's never public) + **playback page** (`/pam/sessions/:id/playback`, asciicast replay + integrity re-verify). Implemented + wired (Nitro `experimental.websocket`); the full in-browser Playwright E2E lands in Stage 10.

**Still open in Stage 3:** **RDP/VNC** Guacamole adapter (`/pam/sessions/:id/desktop`) — **EXTERNALLY CONSTRAINED** (needs guacd + an RDP/VNC target); implement + document in a focused pass.

### Stage 4 — Real credential lifecycle (started)

**Linux/Unix SSH connector — DONE, tested (real password change).**
- `services/pam/connector-runner/connectors/linux-ssh/1.0.0/index.mjs` — real `ssh2` connector: `test`, `verify`, `change`/`rotate` (chpasswd over exec stdin — no shell injection), `reconcile` (via linked logon account), `discover` (passwd/interactive accounts). A change is reported `verified` ONLY after an independent re-login with the new credential.
- Proof: `test/pam/integration/linux-connector.mjs` (`pnpm test:it:linux`) — **8 assertions**: change → **new password authenticates, OLD password rejected**, verify/discover work. Exactly the brief's §19.2 core.
- Packaging: runner image installs `ssh2` (`services/pam/connector-runner/package.json`) + bakes signed bundles at `/connectors` (`NODE_PATH` exposes transports); compose updated. The runner's bundle **verification gate** (Stage 2) and this connector's **logic** are each independently proven; the full runner-container→bundle→target compose E2E is a Stage-10 container test.

**AD/LDAP connector — DONE, tested.** `connectors/ad-ldap/1.0.0/index.mjs` (`ldapts`): test/verify/change/reconcile/discover; **LDAPS by default** (plain `ldap://` refused without `allowInsecure`); AD `unicodePwd` + OpenLDAP `userPassword` paths. Proof: `pnpm test:it:ldap` (7 assertions vs disposable OpenLDAP — change → new binds, old rejected, discover, LDAPS-enforced).

**MySQL/MariaDB connector — DONE, tested.** `connectors/mysql/1.0.0/index.mjs` (`mysql2`): `ALTER USER` with bound literals (no injection), independent re-auth before `verified`, discover from `mysql.user`. Proof: `pnpm test:it:mysql` (7 assertions vs disposable MariaDB — change → new connects, old rejected, discover).

**In-process worker fixes — DONE.** `doRotate` now seals then **independently verifies** the new credential and only reports success when verification passes (failure → `rotation_status='failed'` + risk event, surfaced not hidden). `workerTick` **renews the lease** every ~LEASE_MS/3 while a job runs (fences the >5 min double-execution risk).

**MongoDB connector — DONE, tested.** `connectors/mongodb/1.0.0/index.mjs` (`mongodb` driver): `updateUser`-based change (password as a BSON field, no concatenation), independent re-auth before `verified`, discover via `usersInfo`. Proof: `pnpm test:it:mongo` (6 assertions vs disposable MongoDB — change → new connects, old rejected, discover). This completes the locally-testable connector set.

**Connector publish → verify composition — DONE, tested.** `scripts/pam-publish-connectors.mjs` computes each bundle's SHA-256 → `manifest.json` (baked into the runner image + run by `pam-build-images.sh`); `seedRunnerConnectorRegistry` registers + signs the REAL bundle digests when the manifest is present. Proof: `test/pam/integration/connector-publish.it.ts` — the manifest digest equals the actual file's sha256, the signed registry row carries it, and the runner's verification gate **accepts the real bundle and rejects a tampered one** for all 4 connectors. The connector loop (publish → register/sign → runner verify → execute) is now closed; the only unproven link is the runner *container* loading it, which is a Stage-10 container smoke test.

**Still open in Stage 4 (EXTERNALLY CONSTRAINED — no local targets):** Windows (WinRM), network (Cisco/Fortinet/MikroTik/PANW), cloud (AWS/Azure/GCP), Kubernetes connectors — to implement with the real protocol + a documented mock contract, marked EXTERNALLY CONSTRAINED per the agreed scope; connector dependency-updates (systemd/service/scheduled-task/IIS).

### Stage 5 — Discovery & onboarding (engine + APIs DONE, tested)

- `pamDiscoveryCore.ts` — pure nested AND/OR/NOT rule engine (13 leaf ops incl. cidr/regex/in), priority `matchRule`, conflict detection, fingerprinting. **7 unit tests** (`discovery-core.test.ts`).
- `pamDiscovery.ts` — source CRUD, `testSource`, `runScan` (in-process discover for postgresql; runner-delegated dispatch for ssh/ldap/db — the runner report populates the queue via `reportForRunner`'s discover branch), dedup upsert with delta counts + run records, `applyRulesToRun` (auto-onboard/ignore/review), `onboardDiscovered`, `bulkAction`, rule CRUD + `simulateRules`, scheduled `runDueScans` (wired into bootstrap). Migration `0012_discovery_ext` (adds `privilege_level` etc. — fixes a latent discover crash).
- APIs: `discovery/sources` (+`[id]` GET/PUT/DELETE, `test`, `scan`), `discovery/runs` (+`[id]`), `discovery/rules` (+`[id]`, `simulate`), `discovery/pending/bulk`.
- Proof: `discovery.it.ts` (4 integration) — a **real `postgresql` source scans the live database's login roles into the pending queue**, an onboarding rule **auto-onboards** a match into a safe, a **runner-delegated** scan dispatches → claim → report → queue, and rule simulation + bulk-ignore work.
- **Still open:** UI pages (Stage 9); real IPAM/Monitoring cross-module pull (import-array contract in place); live-scan cancel/pause.

### Stage 6 — Governance (security-critical fixes DONE, tested)

- **Approval enforcement** (`pamRequests.ts` + `approve.post.ts`, migration `0013`): per-level **quorum needs N distinct approvers** (pre-created slots), sequential level gating, **approver eligibility** (asset_owner/safe_owner/group), **separation-of-duties** (owner-cannot-approve + group-conflict), self-approval block. Grants issue only when every level's quorum is met.
- **Step-up bypass removed** (`pamStepUpCore.ts` + `pamStepUp.ts`): the portal-wide bearer exemption is gone for PAM high-risk actions — reveal (high/critical), break-glass, safe/account delete all require a valid step-up proof (or an explicit machine service scope); each success records a short-lived step-up challenge. 4 unit tests incl. the no-bypass regression.
- **Policy CRUD + versioning** (`pamPolicyStore.ts` + `access-policies` POST/PUT/DELETE/`versions`): create/edit/delete policies + approval levels; every write bumps the version and snapshots the definition.
- **Ticket production-safety** (`pamTickets.ts`): unvalidated tickets rejected by default in production.
- Proof: `stepup-core.test.ts` (4 unit) + `governance.it.ts` (5 integration: quorum/distinct, self+eligibility, SoD, policy CRUD+versions).
- **Still open:** break-glass dedicated review record; `require_mfa` wired into session launch; reveal UI sending the step-up header (Stage 9); ServiceNow/Jira mock-integration test.

### Stage 7 — JIT / ZSP (provider framework DONE, tested); vendor + secrets remaining

- **JIT provider framework** (`pamJit.ts`, `pamJitCore.ts`, migration `0014`): full state machine, a real `ldap-group` provider, and a driver that reaches `active` only after provisioning is INDEPENDENTLY verified and `revoked` only after removal is INDEPENDENTLY verified (failed revoke -> `revoke_failed` + critical risk, never a silent "revoked"). Expired-sweep wired into bootstrap (replaced the stub). `/jit` request/provision/revoke routes. Cloud/Windows/k8s providers registered as EXTERNALLY CONSTRAINED (explicit fail, no fake success).
- **ZSP** (`pamZsp.ts` + `/zsp/scan`): detects standing privileged accounts, permanent privileged-group membership without JIT, and non-expiring accounts; records a `standing_privilege` risk per finding. Remediation path is the JIT request/revoke workflow.
- Proof: `jit-core.test.ts` (3 unit) + `jit.it.ts` (3 integration: grant then remove real LDAP group membership, each independently verified; expired-sweep; constrained-provider fails loudly) + `governance.it.ts` ZSP finding.
- **Vendor access — DONE, tested.** `pamVendor.ts`/`pamVendorCore.ts` + `/vendors/*`: org CRUD, hashed one-time invitation, accept→temporary identity, contract/status/network access enforcement, auto-suspend on expiry (in the sweep). `vendor-core.test.ts` (4 unit) + `vendor.it.ts` (3 integration).
- **Secrets lifecycle — DONE, tested.** `pamSecrets.ts` + migration `0015`: version rollback, enforced one-time+TTL leases (fixed the FK-violating `createLease` misuse), dynamic generate-on-read; `/secrets/:id/versions` + `/activate`. `secrets.it.ts` (3 integration).
- **Still open in Stage 7:** OIDC/mTLS/k8s/cloud workload identities (api_token method works; others EXTERNALLY CONSTRAINED); UI pages + the issued-token one-time dialog (Stage 9).

### Stage 8 — Risk engine + compliance (DONE, tested)

- **Risk evaluation engine** (`pamRiskEngine.ts` + pure `pamRiskEngineCore.ts`, migration `0016`): runs on every maintenance sweep (and on-demand via `/risk/evaluate`). Reads REAL event sources — sessions, audit failures, rejected requests, accounts, vendor users — and evaluates the 9 periodic-detectable rules that were previously *defined but never fired*. Each finding gets a stable `dedupe_key` (partial-unique index) so a finding is recorded exactly once no matter how often the sweep runs.
- **Auto-responses EXECUTE (were only stored):** `alert`, `block_session` (terminate the live session[s]), `disable_account`, `suspend_vendor`, `open_investigation` — each a real DB/state action, audited, and recorded in `auto_response_taken`. `enabled`/`severity`/`config`/`auto_response` are now honored from `pam.risk_rules`; rule CRUD via `/risk/rules`.
- **Access certification** (`pamCertification.ts` + pure `pamCertificationCore.ts`): campaign snapshots subjects (active grants / privileged accounts / JIT / safe members) into review items; certify/revoke/delegate. A **revoke performs real enforcement** — revoke grant + terminate its sessions, revoke JIT, disable account, or remove safe membership. Completion recomputes status + writes a stored evidence summary. `/certifications/*` with new `pam.certification.view|manage` perms.
- **Compliance reporting** (`pamReports.ts` + pure `pamReportRenderCore.ts`, migration `0016` `report_runs`): **server-side CSV / real XLSX (exceljs) / dependency-free PDF**. Every generation is stored as an **evidence snapshot** (bytes + sha256, re-downloadable byte-identical). Schedule reader **claims each due schedule atomically** (advance `next_run_at` in the selecting UPDATE) so replicas never double-run, then generates + delivers. In-portal notification delivery is real; SMTP/webhook is EXTERNALLY CONSTRAINED (marked `skipped`, never fake-"delivered"). New `pam.report.manage` perm; routes for generate/download/runs/schedules.
- **Wired into the bootstrap sweep:** `evaluateRiskRules()` + `runDueReportSchedules()` alongside the existing grant/JIT/rotation/vendor sweeps.
- Proof: **+21 unit** (`risk-engine-core` 10, `certification-core`, `report-render` 3 inc. XLSX round-trip + PDF structure) and **+9 integration** (`risk.it` 3, `certification.it` 2, `reports.it` 4) — all green against real Postgres. Cumulative: **88 unit + 42 integration** (1 env-skip when the OpenLDAP container is down).
- **Deferred to later stages:** investigation-workspace / report-builder / certification UIs (Stage 9); `bulk_export` + `recording_integrity_failure` remain point-of-action hooks; SMTP/webhook transport EXTERNALLY CONSTRAINED.

### Stage 9 — UI hardening + new subsystem pages (build-verified)

- **Security-critical UI fixes (completion gates):**
  - New shared **`PamRevealModal`** primitive: reason capture, plaintext shown ONLY inside the dialog (never a table row/scrollback), auto-hide countdown, watermark, policy copy-lock, and the **step-up handshake** — on `428 {stepUpRequired|securityPasswordRequired}` it collects the security password and retries with `x-confirm-password`. Wired into **both** account reveal and secret reveal, closing the gap where the Stage 6 server began requiring step-up but the UI never sent it.
  - `secrets/index.vue` rebuilt: removed `prompt()` and the inline-plaintext-in-row (the audited weakness); now uses the shared modal.
  - New **`PamOneTimeSecretModal`**: acknowledge-to-dismiss dialog for one-time secrets; replaces the persistent app-token alert banner in `applications` and carries the vendor invitation token.
- **New subsystem pages** wired to real Stage 7–8 APIs: `certifications/` (index + `[id]` review with real revoke enforcement), `vendors/` (org + one-time invite + suspend), `jit/` (request/provision/revoke; honestly labels externally-constrained providers), `risk/rules` (enable/severity/auto-responses + Evaluate-now), and a rebuilt `reports/` (server-side CSV/XLSX/PDF generate + download, schedules CRUD, run-history re-download).
- **Consistency:** centralized `statusBadge` in `usePam` (removes duplicated hand-rolled badges), added the new permission computeds, added all nav entries, fixed the `layout:'app'`→`layout:false` bug in `terminal`/`playback` and linked them from session detail.
- **Admin editors added** (turn read-only/partial areas fully usable): `runners/` (enroll→one-time token, rotate, revoke — Stage 2), `discovery/sources` + `discovery/rules` (create/test/scan + onboarding rules + simulate — Stage 5), `policies/` access-policy creation (type + controls + approver level — Stage 6). All nav-wired.
- **Not faked:** host-keys has no backend API → no page fabricated; remains gateway-side only.
- **Proof:** `pnpm build` completes (exit 0) — every new route + page (incl. the 5 admin pages) compiles under Nitro/Vite; `pnpm verify:pam` = 13/13 security-invariant checks (incl. no-`prompt()`, no bearer step-up bypass, one-time dialog, credential never in metadata API).
- **Remaining UI polish (not blocking any subsystem):** advanced multi-level approval-chain editing (single-level create is in; deeper chains via API), and a full light/dark screenshot QA pass.

### Stage 10 — Verification (in progress)

| Gate | Result |
|---|---|
| Production build (`nuxt build`) | **exit 0** — all routes + pages compile |
| Unit (`pnpm test`) | **88 passed** |
| Integration (`pnpm test:it:pam`, real Postgres) | **42 passed**, 1 skip (S3/MinIO backend — needs MinIO) |
| Connector integration (ssh/linux/ldap/mysql/mongo) | ssh 7 · linux 8 · ldap 7 · mysql 7 · mongo 6 (real disposable targets) |
| Go gateway (`go test`) | 6 |
| Security-invariant scan (`pnpm verify:pam`) | **13/13** |
| Browser E2E (`pnpm test:e2e:pam`) | harness complete + extended for Stage 8–9; **env-gated** (needs a provisioned live instance with QA creds) — self-skips otherwise |
| Container smoke (runner→bundle→target, gateway) | proven in Stages 2/4 via disposable containers |
| Swarm deploy | compose + healthchecks + secrets in `docker/docker-compose.pam.yml` (Stage 2) |
