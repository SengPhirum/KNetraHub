<div align="center">

<img src="public/logo/dockhub-symbol-transparent-256.png" alt="KNetraHub logo" width="96" />

# KNetraHub

### *Khmer Netra Hub — a portal for everything in your infrastructure, one hub at a time.*

Self-hosted infrastructure operations — Docker Swarm orchestration, full-stack monitoring,
privileged access management, work/project management, and IP address management — behind
**one login, one theme, and one audit trail.**

<br />

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](./LICENSE)
[![Docs](https://img.shields.io/badge/docs-live-06B6D4.svg?style=flat-square&logo=readthedocs&logoColor=white)](https://sengphirum.github.io/KNetraHub/documentation)
[![Deploy Docs](https://github.com/SengPhirum/KNetraHub/actions/workflows/deploy-docs.yml/badge.svg?branch=main)](https://github.com/SengPhirum/KNetraHub/actions/workflows/deploy-docs.yml)
[![Version](https://img.shields.io/badge/version-0.1.9-8B5CF6.svg?style=flat-square)](./release-notes/RELEASE_NOTES.md)

[![Nuxt 4](https://img.shields.io/badge/Nuxt-4-00DC82?style=flat-square&logo=nuxt&logoColor=white)](https://nuxt.com)
[![Vue 3](https://img.shields.io/badge/Vue-3-4FC08D?style=flat-square&logo=vuedotjs&logoColor=white)](https://vuejs.org)
[![Nuxt UI 4](https://img.shields.io/badge/Nuxt%20UI-4-00DC82?style=flat-square&logo=nuxt&logoColor=white)](https://ui.nuxt.com)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind-v4-38BDF8?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![PostgreSQL + TimescaleDB](https://img.shields.io/badge/PostgreSQL-TimescaleDB-336791?style=flat-square&logo=postgresql&logoColor=white)](https://www.timescale.com)
[![Docker Swarm](https://img.shields.io/badge/Docker-Swarm-2496ED?style=flat-square&logo=docker&logoColor=white)](https://docs.docker.com/engine/swarm/)

**[📖 Documentation](https://sengphirum.github.io/KNetraHub/documentation)** ·
**[📸 Product Tour](#-product-tour)** ·
**[🚀 Quick Start](#-quick-start-development)** ·
**[🧩 The App Suite](#-the-app-suite)** ·
**[⚙️ Configuration](#️-configuration)**

<br />

<img src="public/screenshots/dock-dashboard.png" alt="KNetraHub — live Docker Swarm dashboard with per-service usage charts" width="100%" />

</div>

---

KNetraHub (formerly **DockHub**) is a **single Nuxt application** that presents a portal
shell — login, home launcher, sidebar, permissions, settings, notifications, and a shared
audit trail — in front of a growing suite of independent operations subsystems.

Each subsystem is a self-contained **[Nuxt layer](https://nuxt.com/docs/getting-started/layers)**
that merges into one in-process build. There are no micro-frontends, iframes, or
Module-Federation remotes to run — just one image, one login, one theme, and one deploy.
Every app is gated independently by per-app roles, backed by its **own isolated database**,
and can be enabled or disabled per deployment without touching the others.

> [!NOTE]
> **Five apps ship today**, all fully built (not stubs): **Docker (Dock)**, **Monitoring**,
> **Work**, **Privileged Access (PAM)**, and **IP Management**. See [The App Suite](#-the-app-suite).

---

## 📑 Table of Contents

- [🧩 The App Suite](#-the-app-suite)
- [✨ Highlights](#-highlights)
- [📸 Product Tour](#-product-tour)
- [🏗️ Architecture](#️-architecture)
  - [Portal Core + Layers](#portal-core--layers)
  - [Per-app Access (Keycloak realm roles)](#per-app-access-keycloak-realm-roles)
  - [Why In-Process Layers, not iframes or micro-frontends?](#why-in-process-layers-not-iframes-or-micro-frontends)
  - [Database Separation](#database-separation)
  - [Authentication](#authentication)
- [🚀 Quick Start (Development)](#-quick-start-development)
- [🚢 Production Build & Deploy](#-production-build--deploy)
- [📚 Documentation & GitHub Actions](#-documentation--github-actions)
- [🧪 Smart QA & Screenshot Refresh](#-smart-qa--screenshot-refresh)
- [⚙️ Configuration](#️-configuration)
- [🔐 Roles & Tiers](#-roles--tiers)
- [📡 Monitoring (LibreNMS-equivalent)](#-monitoring-librenms-equivalent)
- [🗺️ Roadmap & Limitations](#️-roadmap--limitations)
- [🛠️ Tech Stack](#️-tech-stack)
- [📝 License & Author](#-license--author)

---

## 🧩 The App Suite

The home page is an **app launcher** that shows only the apps a signed-in user may reach.
The sidebar is **contextual** — it surfaces an app's own navigation only while you are inside it.
Each app lives in its own layer under [`layers/`](./layers), owns a dedicated database, and is
enabled per deployment in **Admin → Modules**.

| | App | Route | What it does | Deep-dive docs |
| :---: | :--- | :--- | :--- | :--- |
| 🐳 | **Docker (Dock)** | `/docker` | Docker Swarm console — nodes, services, stacks, tasks, containers, networks, volumes, secrets, configs, registries; Git-versioned stack deploys with one-click rollback; alerting. | *(built-in)* |
| 📡 | **Monitoring** | `/monitoring` | Clean-room, **LibreNMS-equivalent** platform. One unified device model, registry-driven discovery + polling, durable job queue, structured alerting, SNMP trap & syslog receivers. **No simulated data.** | [`docs/monitoring/`](./docs/monitoring/) · [layer](./layers/monitoring/README.md) |
| ✅ | **Work** | `/work` | Clean-room **ClickUp-equivalent** work/project management — spaces → folders → lists, tasks with subtasks/dependencies/custom fields, List/Board/Table views, Docs, comments, time tracking. | [`docs/work/`](./docs/work/) · [layer](./layers/work/README.md) |
| 🔐 | **Privileged Access (PAM)** | `/pam` | Enterprise **PAM** — cryptographic credential vault (envelope encryption + online key rotation), safes, account onboarding/discovery, automated change/verify/reconcile, approvals, brokered recorded sessions, JIT & break-glass, tamper-evident audit chain. | [`docs/pam/`](./docs/pam/README.md) |
| 🌐 | **IP Management** | `/ipmgt` | **phpIPAM-style** IPAM — sections/subnets (v4+v6), address grids, VLANs/VRFs, devices with encrypted SNMP creds, racks (visual elevations), circuits, NAT, request/approval workflow, discovery, encrypted vault. | [layer](./layers/ipmgt/README.md) |

> A clean installation shows **no module cards** until a portal admin runs **Initialize
> modules** or opens **Admin → Modules** and enables the apps they want.

---

## ✨ Highlights

**Platform**

- **App launcher + contextual sidebar** — users see only the apps they can reach; the sidebar is scoped to the app you're in.
- **Per-app access via Keycloak** — every app is gated independently by realm roles, mapped live in **Settings → Apps & Access** (no redeploy). Each app has a viewer / operator / (manager) / admin tier.
- **Auth & RBAC** — local accounts, LDAP/AD, and OIDC SSO, plus a global portal role for administration. Server-side middleware enforces per-app tiers on every API route.
- **Encrypted at rest** — LDAP bind password, OIDC client secret, registry auth, GitLab token, alert channels, SNMP credentials, and the PAM vault are all AES-256-GCM encrypted (derived from `NUXT_JWT_SECRET` or, for PAM, a versioned master key).
- **Isolated databases** — each app gets its own database; disabling an app stops its work but retains its data; backup/restore always targets exactly one database.
- **Unified notifications & audit** — a portal-wide notification bell (assignments, mentions, alerts, deep links) and a tamper-aware, per-actor audit log across every module.
- **Live theming** — change app name, primary color, logos, and favicon (auto-tinted PWA icon) from **Settings → Appearance**, previewed live.

**Docker (Dock)**

- **Live Swarm control** — nodes (drain/pause/activate, promote/demote, labels, remove), services (scale, redeploy, rolling image updates, logs, delete), tasks, and raw containers.
- **Git-versioned stacks** — deploy from compose YAML; every deploy is committed to GitLab first, giving full history and one-click **rollback** to any previous commit. Configurable entirely from the UI.
- **Alerting** — Telegram, Microsoft Teams, or generic webhook, with customizable `{{placeholder}}` messages, on deploy failure, usage thresholds, node downtime, degraded replicas, or high disk usage.
- **Data resources** — overlay networks, volumes, secrets (write-only), and configs.

**Monitoring, Work, PAM, IP Management** — see [The App Suite](#-the-app-suite) and each app's deep-dive docs.

---

## 📸 Product Tour

Captured from a live instance (dark theme). The in-app documentation ships the same tour, plus a
smart search palette (<kbd>Ctrl</kbd> <kbd>K</kbd>) over every guide, env var, API endpoint, and Q&A entry.

| | |
| :---: | :---: |
| **Sign-in** — local accounts, LDAP / AD, OIDC SSO | **App launcher** — users see only the apps they may reach |
| ![Sign-in](public/screenshots/login.png) | ![App launcher](public/screenshots/portal-home.png) |
| **Stacks** — versioned deploys with tracked history | **Services** — scale, redeploy, rolling image updates |
| ![Stacks](public/screenshots/stacks.png) | ![Services](public/screenshots/services.png) |
| **Service detail** — replicas, tasks, logs & usage history | **Nodes** — fleet availability and resources |
| ![Service detail](public/screenshots/service-detail.png) | ![Nodes](public/screenshots/nodes.png) |
| **Monitoring** — unified device health, sensors & alerts | **IP Management** — subnets, addresses, VLANs, VRFs, devices, racks, circuits, requests, and vault ([details](layers/ipmgt/README.md)) |
| ![Monitoring](public/screenshots/monitoring-dashboard.png) | ![IP Management](public/screenshots/ipmgt-dashboard.png) |
| **Documentation** — animated overview, guides, config & API reference | **Smart Q&A** — curated answers, deep-linked to the right guide |
| ![Documentation](public/screenshots/docs-overview.png) | ![Smart Q&A](public/screenshots/docs-qa.png) |

**Smart search** — press <kbd>Ctrl</kbd> <kbd>K</kbd> anywhere in the docs, ask a question, and jump straight to the answer:

![Smart docs search — natural-language question answered from the Q&A index](public/screenshots/docs-search.png)

---

## 🏗️ Architecture

KNetraHub is one Nuxt app split into a **portal core** and a set of **module layers**, all served
in-process by a single Nitro server:

```text
app/, server/, shared/           <- portal core: login/auth, launcher (home), admin settings,
                                    preferences, users, audit, notifications, alert channels,
                                    shared UI/utils
layers/
├── docker/                      <- Docker Swarm management (nodes, services, stacks, tasks,
│                                   containers, networks, volumes, secrets, configs, registries)
├── monitoring/                  <- LibreNMS-equivalent monitoring (/monitoring, /api/monitoring/v1):
│                                   unified devices, discovery/polling engines, alerting, traps, syslog
├── work/                        <- Work management (/work, /api/work/v1): spaces/folders/lists,
│                                   tasks, views, Docs, comments, time — see layers/work/README.md
├── pam/                         <- Privileged access management (/pam, /api/pam/v1): vault, safes,
│                                   accounts, approvals, sessions, audit chain — see docs/pam/README.md
└── ipmgt/                       <- IP address management (/ipmgt, /api/ipmgt) — see layers/ipmgt/README.md
```

### Portal Core + Layers

Each layer is a [Nuxt layer](https://nuxt.com/docs/getting-started/layers) auto-registered from the
`layers/` directory, mirroring the root structure (`app/pages`, `app/components`, `app/composables`,
`app/utils`, `server/api`, `server/utils`, `server/plugins`). Everything merges into one build with
unchanged URLs and component names — a module's code simply lives in its own folder.

**Adding a new app** needs a `layers/<key>/` folder, one registry entry
([`shared/moduleCatalog.ts`](./shared/moduleCatalog.ts)), and its access wiring (permission vocabulary
+ nav group) — not bespoke portal code.

### Per-app Access (Keycloak realm roles)

Each app is gated independently by **Keycloak realm roles**, with a **viewer/operator/(manager)/admin
tier per app**. The app→role mapping is configured in **Settings → Apps & Access** (editable without
redeploy).

> [!IMPORTANT]
> **Behavior:** Keycloak users see **no apps until an admin fills in the role map** (or signs in as
> the local admin). LDAP users carry no realm roles yet, so they also get no apps unless promoted to
> local admin.

- **Local Admin** — a break-glass superuser that sees every app at admin tier regardless of the map.
- **Server-side enforcement** — `server/middleware/appAccess.ts` gates every API route, resolving the caller's tier and enforcing the *per-app* tier with no per-handler changes.

### Why In-Process Layers, not iframes or micro-frontends?

Earlier iterations experimented with Module Federation remotes; the project **consolidated to a
single in-process Nuxt app** because it removes an entire class of operational and UX problems:

- **One theme, one layout, one navigation** — every app renders inside the portal's own Nuxt UI /
  Tailwind theme, header, and sidebar. No CSS/DOM isolation gymnastics, no double-loaded Vue runtimes.
- **One image, one deploy** — no separate remote UIs/APIs to build, version, host, and keep CORS-safe.
- **Simple, secure auth** — the session lives in the portal; there is no cross-origin token dance.
- **Still isolated where it matters** — layers keep their own pages, components, server routes,
  permission vocabulary, and **database**, so modules stay independent in code and data without being
  independent at runtime.

### Database Separation

KNetraHub uses a **database-per-system** boundary:

- `knetrahub` holds portal identity, preferences, admin settings, audit, notifications, and module lifecycle metadata only.
- Docker, Monitoring, Work, Privileged Access, and IP Management each receive a **dedicated database** when first enabled.
- Module databases may share one PostgreSQL/TimescaleDB host or use separate hosts, as selected by an admin.
- Disabling a module stops access and background work but **retains its database**. Re-enabling reconnects without repeating first-time initialization.
- Maintenance **backup and restore always targets one database**, so restoring a module never overwrites portal or other module data.

### Authentication

The portal handles login and holds the session in an `httpOnly` cookie. Local accounts, LDAP/AD, and
OIDC SSO are supported, plus a global portal role (`viewer`/`operator`/`admin`) for administration.
All apps run in-process and share that session — API routes verify the caller and enforce per-app
tier server-side on every request.

---

## 🚀 Quick Start (Development)

```bash
pnpm install
cp .env.example .env          # edit as needed
pnpm run dev                   # http://localhost:3000
```

By default it talks to Docker at `/var/run/docker.sock`, so run it **on a swarm manager node**. On
first run, KNetraHub opens a one-time administrator setup screen unless `NUXT_ADMIN_USERNAME` and
`NUXT_ADMIN_PASSWORD` are both supplied.

<details>
<summary><b>Local Swarm Development</b> (disposable Docker-in-Docker)</summary>

<br />

To run against a local disposable swarm instead of your host Docker engine:

```bash
pnpm run dev:swarm
```

This uses [`docker/docker-compose.dev.yml`](./docker/docker-compose.dev.yml) to start a lightweight
Docker-in-Docker setup. Useful commands:

```bash
pnpm run dev:swarm -- ps
pnpm run dev:swarm -- logs -f swarm-manager
pnpm run dev:swarm:down
pnpm run dev:swarm:reset  # removes the disposable swarm volumes
```

Equivalently, from a bash shell: `./service.sh dev`, `./service.sh dev --full` (second worker),
`./service.sh dev --down`, `./service.sh dev --reset`, or `./service.sh dev -- <docker compose args>`.

</details>

---

## 🚢 Production Build & Deploy

**Build manually:**

```bash
pnpm run build
node .output/server/index.mjs
```

**Deploy to Swarm** — ship it as a service pinned to a manager node. Build and publish a versioned image:

```bash
./service.sh build
./service.sh push
docker stack deploy -c docker/docker-compose.yml knetrahub
```

Or build locally and deploy in one step (skips version bump + registry push):

```bash
./service.sh deploy
```

<details>
<summary><b>Enabling Privileged Access (PAM)</b> — extra Docker secrets + overlay</summary>

<br />

PAM needs a master key and a couple of signing secrets, then an extra compose overlay:

```bash
printf '%s' "$(openssl rand -base64 48)" | docker secret create knetrahub_pam_master_key -
printf '%s' "$(openssl rand -base64 48)" | docker secret create knetrahub_pam_recording_signing_key -
printf '%s' "$(openssl rand -base64 48)" | docker secret create knetrahub_pam_runner_token -

docker stack deploy -c docker/docker-compose.yml -c docker/docker-compose.pam.yml knetrahub
```

Then enable it in **Admin → Modules → Privileged Access**. Full deployment, key-management, and
hardening guidance lives in [`docs/pam/README.md`](./docs/pam/README.md).

</details>

---

## 📚 Documentation & GitHub Actions

KNetraHub ships **two documentation surfaces**, both generated from the same content:

1. **In-app docs** — the live `/documentation` route inside a running instance: an animated
   overview, per-app guides, an environment-variable reference, an OpenAPI/API reference, and a smart
   Q&A search palette (<kbd>Ctrl</kbd> <kbd>K</kbd>).
2. **Public static docs** — the *same* `/documentation` page rendered to fully static HTML and
   published to **GitHub Pages**, with **no Docker engine or database required at build time**:
   👉 **https://sengphirum.github.io/KNetraHub/documentation**

### Deep-dive references (in this repo)

| Area | Location |
| --- | --- |
| Monitoring — architecture, DB schema, API/CLI guides, LibreNMS parity matrices | [`docs/monitoring/`](./docs/monitoring/) |
| Work — architecture, API, ClickUp parity matrix, migration notes | [`docs/work/`](./docs/work/) |
| PAM — README, connectors, threat model, implementation matrix | [`docs/pam/`](./docs/pam/) |
| IP Management | [`layers/ipmgt/README.md`](./layers/ipmgt/README.md) |
| Release notes | [`release-notes/`](./release-notes/) |

### Building the docs locally

```bash
pnpm run build:docs      # NUXT_STATIC_DOCS=true nuxt generate → .output/public
pnpm run preview:docs    # serve the generated static site locally
```

### GitHub Actions: `deploy-docs.yml`

The [`.github/workflows/deploy-docs.yml`](./.github/workflows/deploy-docs.yml) workflow builds and
publishes the static docs to GitHub Pages automatically.

- **Triggers** — every push to `main` that touches docs content or the build config
  (`app/pages/documentation.vue`, `app/components/DocsSidebar.vue`, `nuxt.config.ts`, `package.json`,
  `pnpm-lock.yaml`, or the workflow file itself), plus manual **workflow_dispatch**.
- **Build job** — checks out the repo, sets up pnpm 11 + Node 22 (with pnpm cache),
  `pnpm install --frozen-lockfile`, then `pnpm run build:docs`. The base URL is derived from the
  repo name (`NUXT_DOCS_BASE_URL=/${{ github.event.repository.name }}/`) so case-sensitive Pages
  paths always match. Placeholder secrets satisfy runtime-config validation at build time only.
- **Deploy job** — uploads `.output/public` as a Pages artifact and publishes it with
  `actions/deploy-pages`. A `concurrency: pages` group cancels any in-progress run.

**One-time setup (for a fork):**

1. Repo **Settings → Pages → Build and deployment → Source: "GitHub Actions"**.
2. Push to `main` (or run the workflow manually from the **Actions** tab).
3. Your docs go live at `https://<your-username>.github.io/<repo-name>/documentation`.

> Using a custom domain or a `username.github.io` user/org site? Set `NUXT_DOCS_BASE_URL` to `/`
> in the workflow's build step.

---

## 🧪 Smart QA & Screenshot Refresh

Run the read-only core QA workflow against any running KNetraHub instance. It checks the database
health probe, setup/auth APIs, public documentation, browser console, and — when credentials are
supplied — the authenticated launcher and Docker resource pages. Successful captures replace the
canonical files in `public/screenshots/`, so this README and the in-app product tour update together.

```bash
# Public core checks and documentation screenshots
./service.sh qa --base-url http://localhost:3000

# Include authenticated core pages (prefer env vars for secrets)
QA_USERNAME=admin QA_PASSWORD='secret' ./service.sh qa --scope core

# Initialize small fixtures and a temporary qa-admin, test every module, then clean up
./service.sh qa --init-data --scope full

# First run, or after clearing Playwright's browser cache
./service.sh qa --install-browser
```

Useful parameters include `--scope smoke|core|full`, `--browser chromium|firefox|webkit`,
`--screenshots-dir`, `--report-dir`, `--headed`, and `--no-screenshots`. The machine-readable result
is written to `.qa-results/smart-qa-report.json`. QA never performs mutations such as deploy, scale,
delete, or configuration updates.

`--init-data` is the explicit exception to the read-only rule: it transactionally creates only
deterministic `qa-*` fixtures covering portal audit data, Docker stack history, and IP Management
(Monitoring holds only real collected data, so it has no QA fixtures). Fixtures are removed after QA
by default. Add `--keep-data` for manual inspection, then remove them with `./service.sh qa
--clean-data`. The temporary account is `qa-admin` with local-only password `qa-local-only`; override
that password with `QA_FIXTURE_PASSWORD` when needed.

---

## ⚙️ Configuration

Everything is configured via environment variables — see [`.env.example`](./.env.example) for the
full, commented list. The essentials:

| Variable | Purpose |
| --- | --- |
| `NUXT_JWT_SECRET` | Signs session cookies and encrypts stored credentials. **Set a long random value!** |
| `NUXT_DOCKER_SOCKET_PATH` | Docker socket path (default `/var/run/docker.sock`). |
| `NUXT_DOCKER_HOST` / `PORT` | Use a remote engine over TCP. |
| `NUXT_DB_HOST` / `NAME` / `USER` | Main portal database connection; module databases are configured under Admin → Modules. |
| `NUXT_METRICS_RETENTION_DAYS` | How many days of metrics history to keep (default `30`). |

<details>
<summary><b>Appearance, LDAP/OIDC, GitLab versioning & Alerts</b></summary>

<br />

**Appearance** — change the app name, primary color, logos, and favicon directly from **Settings →
Appearance**. Changes preview live and are stored inline (the PWA icon is auto-tinted to the primary color).

**LDAP & OIDC SSO**
- **LDAP:** set `NUXT_LDAP_ENABLED=true` and provide directory details. Map groups using `NUXT_LDAP_ADMIN_GROUP` and `NUXT_LDAP_OPERATOR_GROUP`.
- **OIDC:** set `NUXT_OIDC_ENABLED=true`, `NUXT_OIDC_ISSUER`, `CLIENT_ID`, and `CLIENT_SECRET`. Compatible with Keycloak, Authentik, Okta, etc.

**GitLab stack versioning** — configure entirely via the UI: **Dock → Settings → Integrations**.
Deploying a stack commits the compose file to your repository. The status dot is green only when the
token works. Removing running services leaves the compose file intact until explicitly deleted.

**Alerts** — configure via **Dock → Settings → Alerts** (Telegram, MS Teams, Webhooks). Alerts cover
deploy failures, service usage thresholds, node downtime, degraded replicas, and high disk usage.
`NUXT_ALERTS_INTERVAL_MINUTES=3` determines how often thresholds are checked.

</details>

<details>
<summary><b>Monitoring & IP Management scanning</b></summary>

<br />

**Monitoring** (all optional — sensible defaults shown; see [`docs/monitoring/`](./docs/monitoring/) for the full list):

| Variable | Default | Purpose |
|---|---|---|
| `NUXT_MONITORING_DISPATCHER_ENABLED` | `true` | Master switch for this node's scheduler + workers |
| `NUXT_MONITORING_POLL_INTERVAL_SECONDS` | `300` | Device polling cadence |
| `NUXT_MONITORING_DISCOVERY_INTERVAL_SECONDS` | `21600` | Full rediscovery cadence |
| `NUXT_MONITORING_WORKER_CONCURRENCY` | `16` | Concurrent jobs per node |
| `NUXT_MONITORING_SNMP_TIMEOUT_MS` | `3000` | Per-request SNMP timeout |
| `NUXT_MONITORING_SNMP_RETRIES` | `2` | SNMP retries per request |
| `NUXT_MONITORING_TRAP_ENABLED` | `false` | SNMP trap receiver (UDP :1162) |
| `NUXT_MONITORING_SYSLOG_ENABLED` | `false` | Syslog receiver (UDP/TCP :1514) |

**IP Management** (all optional):

| Variable | Default | Purpose |
|---|---|---|
| `NUXT_IPMGT_SCAN_ENABLED` | `true` | Scheduled host-status/discovery scanning |
| `NUXT_IPMGT_SCAN_INTERVAL_SECONDS` | `300` | Scan cycle interval |
| `NUXT_IPMGT_SCAN_CONCURRENCY` | `16` | Max concurrent pings per cycle |
| `NUXT_IPMGT_PING_TIMEOUT_SECONDS` | `2` | Per-host ping timeout |

</details>

---

## 🔐 Roles & Tiers

Every app carries its own **viewer → operator → (manager) → admin** tier, derived from
**Settings → Apps & Access**. Using Docker (Dock) as the example:

| Capability (within an app) | viewer | operator | admin |
| --- | :---: | :---: | :---: |
| View everything | ✅ | ✅ | ✅ |
| Scale / redeploy / deploy stacks | ❌ | ✅ | ✅ |
| Manage nodes, networks, volumes, secrets, configs | ❌ | ✅ | ✅ |
| Manage registries | ❌ | ❌ | ✅ |

- **Global role** — governs portal-level administration (users, audit, auth settings).
- **Per-app tier** — governs what you can do *inside* an app. Apps with a fourth **manager** tier
  (Work, PAM) insert approval/oversight capabilities between operator and admin — see each app's docs
  (e.g. [`docs/pam/README.md`](./docs/pam/README.md#permission-reference-tiers-are-cumulative)).

> **How "stacks" work:** Docker Swarm has no native stack API. KNetraHub parses your compose YAML,
> ensures declared overlay networks exist, and creates/updates services with the
> `com.docker.stack.namespace` label. It warns rather than failing on unsupported compose directives.

---

## 📡 Monitoring (LibreNMS-equivalent)

The **Monitoring app** (`/monitoring`, layer [`layers/monitoring/`](./layers/monitoring/)) is a
clean-room, LibreNMS-equivalent monitoring platform with **one unified device model**: routers,
switches, firewalls, servers, hypervisors, printers, wireless controllers, storage, UPS and
environmental systems are all *devices* whose capabilities are detected by modular **discovery** and
collected by modular **polling**. There is **no simulated/dummy data** — every status, interface,
sensor, and alert comes from a real device.

Full documentation lives in [`docs/monitoring/`](docs/monitoring/) — architecture, database schema,
module guides, API guide, and the LibreNMS feature-parity matrix.

<details>
<summary><b>How it works, prerequisites & verification</b></summary>

<br />

**How it works**

- **Dispatcher & workers** — a durable, DB-backed job queue (`monitoring.jobs`) with leases, retries,
  backoff, and dead-lettering. Each app instance registers as a poller node and claims jobs up to
  `NUXT_MONITORING_WORKER_CONCURRENCY`; devices are assigned to poller groups for distributed polling.
  No fire-and-forget `setInterval` polling.
- **Discovery (every 6h + on add)** — registry-driven modules (system/OS detection, ports, processors,
  memory pools, storage, health sensors, ENTITY-MIB inventory, IP addresses, ARP/FDB, VLANs, BGP,
  OSPF, …) reconcile discovered entities against the database with stable identity keys — new entities
  inserted, changed ones updated, missing ones marked **stale** (never deleted after a single failed walk).
- **Polling (every 5m)** — each enabled module collects **every** discovered entity with per-request
  outcome tracking. Counter rollover, reboots, and interface-speed changes are handled; rates and
  utilisation are computed from counter deltas.
- **No silent loss** — each poll starts from a persisted **collection plan**; every planned item ends
  as persisted / unsupported / skipped-with-reason / failed-with-error. The **Data Collection** pages
  show coverage, failures, and stale data down to individual OIDs.
- **Alerting** — structured rules (AND/OR groups, duration conditions) → alert incidents with
  acknowledge/recover lifecycle, maintenance and dependency suppression, templates, pluggable transports.
- **Receivers** — opt-in SNMP trap receiver (UDP 1162) and syslog receiver (RFC 3164/5424, UDP/TCP
  1514), both device-associated and searchable.
- **SNMP v1/v2c/v3** — per-device or via reusable **credential profiles**; credentials are
  AES-256-GCM encrypted at rest and never returned to the browser.

**Prerequisites**

1. **Reachability** from the KNetraHub server to your devices: ICMP echo allowed and UDP/161 open.
2. **A working `ping` binary** — the Docker image installs `iputils` automatically; on bare metal ensure `ping` is on `PATH`.
3. **SNMP enabled on the devices** with a community string or v3 credentials.

**Verify it's working** — a reachable device flips to **up** within one poll cycle and its overview
shows uptime, hardware, and OS from SNMP. The **Ports** tab lists every interface, **Health** lists
every discovered sensor, and **Data Collection** shows the collection-plan outcome for the last run —
anything less than 100% coverage is itemised, never hidden.

</details>

---

## 🗺️ Roadmap & Limitations

**Shipping today**
- Five fully-built apps: Docker (Dock), Monitoring, Work, Privileged Access (PAM), IP Management.
- Live read + control for Docker resources with Git-versioned stacks and rollback.
- LibreNMS-equivalent monitoring with real discovery/polling — no simulated data.
- Enterprise PAM with encrypted vault, approvals, recorded sessions, and a tamper-evident audit chain.
- LDAP/OIDC auth with JWT/RBAC, per-app access, isolated databases, unified notifications & audit.

**On the roadmap**
- PAM protocol-isolation sidecars packaged for turnkey deploy (SSH gateway, guacd RDP/VNC, connector-runner).
- Work: goals, dashboards, and automations (tracked honestly in the [parity matrix](./docs/work/feature-parity-matrix.md)).
- Container exec/terminal and webhook-driven GitOps redeploys for Docker.
- IPAM: live DNS push (PowerDNS) and DHCP/Kea integration (see [ipmgt limitations](./layers/ipmgt/README.md#known-limitations--deferred-enhancements)).

**Platform-wide gaps** *(disclosed rather than hidden)*
- No API rate limiting, request IDs, or idempotency keys yet.
- Automated test coverage is concentrated in PAM and Monitoring pure-logic units; broader E2E coverage is a work in progress.

---

## 🛠️ Tech Stack

- **Framework** — Nuxt 4 (Nitro + Vue 3), Nuxt UI 4, Tailwind CSS v4, `@vite-pwa/nuxt`.
- **Data** — PostgreSQL + TimescaleDB (`pg`), database-per-module; raw parameterized SQL, no ORM.
- **Auth & crypto** — `jose` (JWT), `bcryptjs`, `ldapts` (LDAP), AES-256-GCM at rest, PAM envelope encryption with versioned master key.
- **Infra & protocols** — `dockerode` (Docker), `net-snmp` + `ping` (Monitoring/IPAM), `ssh2` (PAM sessions), `mysql2` / `mongodb` / `pg` (PAM connectors), `yaml` (compose), `exceljs` (export).
- **UI** — `chart.js` + `vue-chartjs`, `@xterm/xterm` (terminals), `grid-layout-plus` (dashboards), `@nuxt/icon` + Lucide.
- **Tooling** — pnpm 11, Vitest, Playwright (Smart QA), GitHub Actions (static docs → GitHub Pages).

---

## 📝 License & Author

**Author:** Seng Phirum — [sengphirum143@gmail.com](mailto:sengphirum143@gmail.com)

MIT © 2026 Seng Phirum · See [LICENSE](./LICENSE) for full details.
