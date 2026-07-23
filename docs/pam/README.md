# KNetraHub PAM — Privileged Access Management

KNetraHub PAM is a native KNetraHub sub-application providing enterprise
privileged-access management: a cryptographic credential vault, safes with
granular membership, privileged-account onboarding and discovery, automated
credential change/verify/reconcile/rotate, access requests with multi-level
approvals and ticket validation, brokered isolated sessions with recording,
just-in-time access, break-glass, application/workload secrets, deterministic
privileged threat analytics, and a tamper-evident audit trail.

- **Route:** `/pam` · **API:** `/api/pam/v1` · **App key:** `pam` · **Schema:** `pam`
- Runs as a Nuxt layer at [`layers/pam/`](../../layers/pam/), auto-registered exactly like the docker/monitoring/ipmgt layers.
- Enabled per-deployment in **Admin → Modules** (dedicated database, default `knetrahub_pam`).

## What is operational vs. what needs a sidecar

Everything that lives in the Nuxt process + PostgreSQL is **fully operational and
tested**; the protocol-isolation services are **real code you deploy separately**.

| Capability | Status |
|---|---|
| Envelope-encryption vault (AES-256-GCM, DEK/KEK, versioned master key, online rotation, fail-closed) | ✅ Operational, unit-tested |
| Safes + granular membership authorization | ✅ Operational |
| Account onboarding, no plaintext at rest, guarded reveal with step-up/lease/audit | ✅ Operational |
| Credential worker (Postgres queue, `FOR UPDATE SKIP LOCKED`, retry/backoff/dead-letter) | ✅ Operational |
| `generic` (vault-managed) + `postgresql` connectors (change/verify/reconcile/discover) | ✅ Operational, real target ops |
| Access requests, multi-level approvals, no-self-approval/SoD, ticket validation, grants | ✅ Operational |
| Just-in-time entitlements + automatic revocation + revoke-failure alerting | ✅ Operational (vault-local); target-applied entitlements need the runner |
| Break-glass emergency access (step-up, alerts, mandatory recording, post-use rotation) | ✅ Operational |
| Application/workload secrets API + token identities + policy-scoped retrieval + leases | ✅ Operational |
| Deterministic risk analytics (20 explainable rules) | ✅ Operational |
| Tamper-evident audit (hash chain + signed checkpoints + verification job) | ✅ Operational, unit-tested |
| Reports (9), CSV/JSON export | ✅ Operational |
| Session **control plane** (start → gateway token → checkout → ingest → terminate/monitor/recordings) | ✅ Operational |
| SSH terminal streaming + recording bytes | 🔌 `services/pam/ssh-gateway` (Go) — deploy the sidecar |
| Browser RDP/VNC | 🔌 `guacd` + KNetraHub authorization adapter — deploy the sidecar |
| OS/network/cloud credential change against real targets | 🔌 `services/pam/connector-runner` — connectors return an honest "requires runner" result until attached |

The runner-delegated connectors **never fake success**: their `change`/`verify`
return `{ ok: false, requiresRunner: true, detail: "…NOT applied to the target" }`
so a job fails visibly rather than silently claiming a rotation happened.

## Architecture

```
Browser ──▶ KNetraHub app (Nuxt/Nitro)
              ├─ /pam pages (permission-aware)
              ├─ /api/pam/v1/* (server-side authz: tier → safe membership → policy → grant → step-up)
              ├─ Vault (pamCrypto): DEK per version, wrapped by versioned master KEK (Docker secret)
              ├─ Audit chain (pam.audit_events) + signed checkpoints
              ├─ Credential worker (pam.credential_jobs, SKIP LOCKED)  ── connectors ──▶ targets
              └─ Session control plane ── gateway token ──┐
                                                          ▼
       pam-ssh-gateway (Go) ── checkout (server-side creds) ──▶ SSH target ; records asciicast ──▶ ingest
       guacd + adapter      ── one-time token ──▶ RDP/VNC target
       pam-connector-runner ── isolated custom connectors (no docker socket)
       PostgreSQL `pam` schema  ·  MinIO/S3 (encrypted recordings)
```

Full data-flow and trust boundaries: [THREAT-MODEL.md](./THREAT-MODEL.md).

## Authorization model (defence in depth)

The KNetraHub app tier (viewer/operator/manager/admin) is only the **first**
layer. Every privileged API additionally enforces, server-side:

1. **Safe membership** + granular safe permission (`reveal_credential`, `use_account`, …)
2. **Account/platform policy**
3. **Approval state** — an active, approved grant is required to reveal/connect (non-admins)
4. **Ticket status** — validated against ServiceNow/Jira/generic REST when configured
5. **Step-up MFA** — the portal security password, for critical reveals, deletes and break-glass
6. **Time window / source network** — evaluated per policy
7. **Separation of duties / no self-approval**

Frontend visibility is never authorization. See the permission reference below.

### Permission reference (tiers are cumulative)

- **Viewer:** `pam.view` `pam.dashboard.view` `pam.safe.view` `pam.account.view` `pam.platform.view` `pam.policy.view` `pam.connector.view` `pam.discovery.view` `pam.request.view` `pam.session.view` `pam.report.view` — never decrypts a credential.
- **Operator:** + `pam.request.create` `pam.session.connect` `pam.account.use` `pam.account.rotate` `pam.account.reconcile` `pam.account.manage` `pam.discovery.run` `pam.secret.use`
- **Manager:** + `pam.request.approve` `pam.session.monitor` `pam.session.terminate` `pam.recording.view` `pam.recording.export` `pam.account.reveal` `pam.audit.view` `pam.report.export`
- **Admin:** + `pam.safe.manage` `pam.account.delete` `pam.platform.manage` `pam.policy.manage` `pam.connector.manage` `pam.discovery.manage` `pam.secret.manage` `pam.request.override` `pam.settings` `pam.recovery.manage`

## API reference (summary)

Versioned under `/api/pam/v1`. Consistent JSON, server-side authz on every route.

| Group | Endpoints |
|---|---|
| dashboard/health | `GET dashboard`, `GET health` |
| safes | `GET/POST safes`, `GET/PUT/DELETE safes/:id`, `GET/POST safes/:id/members`, `DELETE safes/:id/members/:memberId` |
| accounts | `GET/POST accounts`, `GET/PUT/DELETE accounts/:id`, `POST accounts/:id/{reveal,rotate,verify,reconcile}` |
| platforms/connectors | `GET/POST platforms`, `GET connectors` |
| discovery | `GET discovery/pending`, `POST discovery/pending/:id/onboard` |
| requests/approvals | `GET/POST requests`, `GET requests/:id`, `POST requests/:id/{approve,reject,cancel}`, `GET approvals` |
| grants/break-glass | `GET grants`, `POST grants/:id/revoke`, `POST break-glass` |
| sessions | `GET/POST sessions`, `GET sessions/:id`, `POST sessions/:id/{terminate,markers}`, `GET sessions/recordings` |
| gateway (token-auth) | `POST gateway/checkout`, `POST gateway/ingest` |
| secrets/apps | `GET/POST secrets`, `POST secrets/:id/reveal`, `POST secrets/retrieve` (app-token), `GET/POST applications`, `POST applications/:id/identities` |
| risk/audit/reports | `GET risk`, `POST risk/:id/status`, `GET audit`, `POST audit/verify`, `GET reports`, `GET reports/:key` |
| policies/settings/jobs | `GET access-policies`, `GET/PUT settings`, `GET jobs` |

## Cross-module integrations

- **IP Management:** link a privileged account to an IPAM address (`accounts.ipam_address_id`); use IPAM ranges as discovery scope.
- **Monitoring:** link an account to a monitored device (`accounts.monitoring_device_id`); repeated rotation/JIT-revocation/gateway failures raise PAM risk events + notifications that surface in the shared alert channels.
- **Docker:** the app image doubles as the `pam-worker`; Docker/registry credentials can be vaulted; the connector-runner never receives the Docker socket.

## Deployment & validation

See [deploy commands](#exact-commands) below, [backup & key management](#backup--key-management), and [hardening](#hardening).

### Exact commands

```bash
# 1. Install + build
corepack pnpm install
corepack pnpm run build

# 2. Unit tests (vault, password policy, policy evaluators, audit chain)
corepack pnpm test

# 3. Create the required Docker secrets (Swarm)
printf '%s' "$(openssl rand -base64 48)" | docker secret create knetrahub_pam_master_key -
printf '%s' "$(openssl rand -base64 48)" | docker secret create knetrahub_pam_recording_signing_key -
printf '%s' "$(openssl rand -base64 48)" | docker secret create knetrahub_pam_runner_token -

# 4. Deploy the PAM overlay alongside the main stack
docker stack deploy -c docker/docker-compose.yml -c docker/docker-compose.pam.yml knetrahub

# 5. Enable PAM: Admin → Modules → Privileged Access → Enable (dedicated DB)
#    On enable, migrations run and built-in platforms/connectors/risk-rules seed.

# 6. Verify: /pam dashboard loads; /pam/audit → "Verify chain" returns ok.
```

### Backup & key management

- **Database:** PAM's dedicated database is backed up by **Admin → System → Maintenance** like every module (pg_dump). Restores suspend the PAM runtime.
- **Master key:** stored only as a Docker secret; the app records a non-reversible fingerprint in `pam.crypto_keys` and warns loudly on mismatch. **Losing the master key makes all vaulted values unrecoverable.** Back it up out-of-band (a sealed envelope / HSM export / split shares in `NUXT_PAM_RECOVERY_MATERIAL`).
- **Rotation (online):** add a new key version to the keyring JSON (`{"active":2,"keys":{"1":"…","2":"…"}}`), redeploy, then run the admin rewrap (`rewrapAll`) — value ciphertext is untouched; only DEK wrappers change.
- **Recordings:** stored encrypted with per-object checksum + keyed signature in MinIO/S3; metadata (not bytes) in Postgres; retention/legal-hold per safe.

### Hardening

Non-root containers, dropped capabilities, read-only rootfs on the sidecars; the
Docker socket is never mounted into a PAM sidecar; internal-only overlay for
sidecar traffic; no public DB/guacd/worker/runner/gateway ports; short-lived
audience-scoped gateway tokens; no-store on every plaintext response; secrets
redacted from logs and never placed in notifications; connector command
arguments are structured/escaped (never string-concatenated).

### Troubleshooting

- **"vault is unavailable and fails closed"** — `NUXT_PAM_MASTER_KEY` is unset in production. Set the secret and redeploy.
- **"MASTER KEY MISMATCH" in logs** — the configured key differs from the recorded fingerprint; restore the correct key or rotate to a new version.
- **Rotation job dead-letters with "requires connector-runner"** — the target family needs the out-of-process runner; deploy `pam-connector-runner` (or use the `generic`/`postgresql` connectors).
- **Reveal returns 403 "approved, active grant required"** — submit an access request first (non-admins always need a grant).

## Guides

- [Connector development](./CONNECTORS.md)
- [Threat model & data flows](./THREAT-MODEL.md)
