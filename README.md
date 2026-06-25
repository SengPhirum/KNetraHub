# KNetraHub

**A portal for everything in your infrastructure, one hub at a time.** 

KNetraHub (formerly **DockHub**) is the portal shell—handling login, dashboard, sidebar, permissions, and settings—for a growing set of independent operations subsystems. These subsystems are loaded into the shell via **Module Federation**.

The first and only fully-built subsystem today is **KNetraHub-Docker**: a complete Docker Swarm management console featuring:
- Live nodes, services, stacks, tasks, networks, volumes, secrets, and configs
- GitOps stack versioning
- Alerting and Role-Based Access Control (RBAC)
- Audit logs

Built with **Nuxt 4** + **Nuxt UI 4** + **Tailwind v4**.

---

## 📑 Table of Contents

- [✨ Highlights](#-highlights)
- [🏗️ Architecture](#️-architecture)
  - [Per-app Access](#per-app-access-keycloak-realm-roles)
  - [Module Federation](#why-module-federation-not-iframes)
  - [Host vs. Remote Side](#how-it-works-host-side)
  - [Database Separation](#database-separation)
- [🚀 Quick Start (Development)](#-quick-start-development)
  - [Local Swarm Development](#local-swarm-development)
- [🚢 Production Build & Deploy](#-production-build--deploy)
- [⚙️ Configuration](#️-configuration)
  - [Appearance](#appearance)
  - [LDAP & OIDC](#ldap--oidc-sso)
  - [GitLab Versioning](#gitlab-stack-versioning)
  - [Alerts](#alerts)
- [🔐 Roles & Tiers](#-roles--tiers)
- [🧩 How "Stacks" Work](#-how-stacks-work)
- [🗺️ Roadmap & Limitations](#️-roadmap--limitations)
- [🛠️ Tech Stack](#️-tech-stack)
- [📝 License & Author](#-license--author)

---

## ✨ Highlights

- **Live Swarm Control:** Manage nodes (drain/pause/activate, promote/demote, labels, remove), services (scale, redeploy, rolling image updates, logs, delete), tasks, and raw containers.
- **Git-Versioned Stacks:** Deploy stacks from compose YAML. Every deploy is committed to GitLab first, giving you a full change history and one-click **rollback** to any previous commit. Configurable entirely from the UI (no env vars required).
- **Alerting:** Notify Telegram, Microsoft Teams, or any generic webhook. Alerts trigger when a deploy fails, a service nears its CPU/memory limit, a node stops reporting, replicas stay degraded, or disk usage crosses a threshold. Customizable `{{placeholder}}` messages.
- **Data Resources:** Create and manage overlay networks, volumes, secrets (write-only), and configs.
- **Portal + App Launcher:** The home page lists only the apps you can reach (Dock, Net, Server, IP Mgt, etc.). The sidebar is contextual to the app you're in. Docker management is the built-in **"Dock"** app.
- **Per-App Access via Keycloak:** Each app is gated independently by realm roles, mapped in Settings → Apps & Access. Supported by a viewer/operator/admin tier per app.
- **Auth & RBAC:** Local accounts, LDAP, and OIDC SSO. Includes a global role (`viewer`/`operator`/`admin`) for portal administration.
- **Encrypted Credentials:** LDAP bind password, OIDC client secret, registry auth, GitLab token, and alert channel configs are all encrypted at rest (AES-256-GCM, derived from `NUXT_JWT_SECRET`).
- **Audit Log:** Every state-changing action is recorded with actor, target, and detail.

---

## 🏗️ Architecture

KNetraHub is split into a **portal** (this repo's `app/` and `server/`) and **subsystems**, each independently buildable/deployable:

```text
KNetraHub (portal)              <- login, user prefs, app launcher (home), settings, audit, access control
├── Dock  (KNetraHub-Docker)    <- built in, in-repo app (existing Swarm pages, dashboard at /dock)
├── KNetraHub-Net      (remote)  <- remotes/knetrahub-net + services/knetrahub-net-api
├── KNetraHub-Server   (remote)  <- not built yet, same pattern as KNetraHub-Net
└── KNetraHub-IPMgt    (remote)  <- not built yet, same pattern as KNetraHub-Net
```

The **home page is an app launcher**: it shows only the apps the signed-in user may reach. The sidebar is **contextual** - it surfaces an app's own navigation only while you're inside that app. 

### Per-app Access (Keycloak realm roles)

Each app is gated independently by **Keycloak realm roles**, with a **viewer/operator/admin tier per app**. The app→role mapping is configured in **Settings → Apps & Access** (editable without redeploy).

> [!IMPORTANT]
> **Behavior change:** Keycloak users see **no apps until an admin fills in the role map** (or signs in as the local admin). LDAP users carry no realm roles yet, so they also get no apps unless promoted to local admin.

- **Local Admin:** A break-glass superuser that sees every app at admin tier regardless of the map.
- **Server-Side Enforcement:** `server/middleware/appAccess.ts` gates every API route, resolving the caller's tier and enforcing the *per-app* tier with no handler changes.

### Why Module Federation, not iframes?

An iframe isolates a remote's CSS/DOM cleanly, but it can't share the portal's layout, theme, or navigation. Module Federation loads a remote's actual Vue component into the portal's own page—same sidebar, same header, same Nuxt UI/Tailwind theme—while keeping the remote's code independent.

### How it works (Host Side)

1. `app/utils/moduleRegistry.ts` lists every module.
2. `app/composables/useNav.ts` builds a sidebar group filtered by permissions.
3. Visiting a remote's route renders `<RemoteModuleLoader>` inside `<ClientOnly>`. It fetches a short-lived token, registers the remote, and shows the mounted component.
4. `app/plugins/module-federation.client.ts` initializes the runtime and contributes the portal's own Vue instance to the federation share scope.

### How it works (Remote Side) - KNetraHub-Net

`remotes/knetrahub-net/` is a separate, independently runnable Nuxt 4 project:
- `ssr: false` (CSR-only to sidestep SSR/Module Federation conflicts).
- Uses `@module-federation/vite` to expose components.
- Fixes applied for `remoteEntry.js` routing, CORS handling, and strict ES module types.

### Database Separation

One shared Postgres/TimescaleDB instance, separated by **schema**:
- Portal tables in `public`.
- `KNetraHub-Net` owns a `net` schema.
- Future modules like `KNetraHub-Server` will follow the identical pattern (`server` schema).

### Shared Authentication

The portal handles login and holds the session in an `httpOnly` cookie. The `RemoteModuleLoader` fetches a 5-minute, audience-scoped JWT and passes it to the remote API. The remote API verifies it independently—never trusting the portal or frontend.

---

## 🚀 Quick Start (Development)

```bash
npm install
cp .env.example .env          # edit as needed
npm run dev                   # http://localhost:3000
```

By default, it talks to Docker at `/var/run/docker.sock`, so run it **on a swarm manager node**. On first run, it seeds an admin account:
- **Username:** `admin`
- **Password:** `admin`

> [!WARNING]
> Override the seed with `NUXT_ADMIN_USERNAME` / `NUXT_ADMIN_PASSWORD` and **change it immediately** in production.

### Running with a Remote Subsystem (Module Federation)

To see KNetraHub-Net loaded into the portal:
```bash
npm run dev:mf
```
This runs the portal (`:3000`), the KNetraHub-Net UI (`:3101`), and its API (`:4101`) side by side. Visit `http://localhost:3000/net`.

### Local Swarm Development

To run against a local disposable swarm instead of your host Docker engine:
```bash
npm run dev:swarm
```
This uses [`docker-compose.dev.yml`](./docker-compose.dev.yml) to start a lightweight Docker-in-Docker setup.

Useful commands:
```bash
npm run dev:swarm -- ps
npm run dev:swarm -- logs -f swarm-manager
npm run dev:swarm:down
npm run dev:swarm:reset  # removes the disposable swarm volumes
```

---

## 🚢 Production Build & Deploy

### Building Manually
```bash
npm run build
node .output/server/index.mjs
```

### Deploying to Swarm
Ship it as a swarm service, pinned to a manager node. Build and publish:
```bash
./release.sh
```

Deploy the published image:
```bash
docker stack deploy -c docker-compose.yml dockhub
```

---

## ⚙️ Configuration

Everything is configured via environment variables (see [`.env.example`](./.env.example)).

| Variable | Purpose |
| --- | --- |
| `NUXT_JWT_SECRET` | Signs session cookies and encrypts stored credentials. **Set a long random value!** |
| `NUXT_DOCKER_SOCKET_PATH` | Docker socket path (default `/var/run/docker.sock`). |
| `NUXT_DOCKER_HOST` / `PORT` | Use remote engine over TCP. |
| `NUXT_DB_HOST` / `NAME` / `USER` | Postgres + TimescaleDB connection. |
| `NUXT_METRICS_RETENTION_DAYS` | How many days of metrics history to keep (default `30`). |

### Appearance
Change the app name, primary color, logos, and favicon directly from **Settings -> Appearance**. Changes preview live and are stored inline.

### LDAP & OIDC SSO
- **LDAP:** Set `NUXT_LDAP_ENABLED=true` and provide directory details. Map groups using `NUXT_LDAP_ADMIN_GROUP` and `NUXT_LDAP_OPERATOR_GROUP`.
- **OIDC:** Set `NUXT_OIDC_ENABLED=true`, `NUXT_OIDC_ISSUER`, `CLIENT_ID`, and `CLIENT_SECRET`. Compatible with Keycloak, Authentik, Okta, etc.

### GitLab Stack Versioning
Configure entirely via the UI: **Dock -> Settings -> Integrations**.
Deploying a stack commits the compose file to your repository. The status dot is only green when the token works. Removing running services leaves the compose file intact until explicitly deleted.

### Alerts
Configure via **Dock -> Settings -> Alerts**. Supports Telegram, MS Teams, and Webhooks. Alerts cover deploy failures, service usage thresholds, node downtime, degraded replicas, and high disk usage. 
`NUXT_ALERTS_INTERVAL_MINUTES=3` determines how often thresholds are checked.

---

## 🔐 Roles & Tiers

| Capability (within an app) | viewer | operator | admin |
| --- | :---: | :---: | :---: |
| View everything | ✅ | ✅ | ✅ |
| Scale / redeploy / deploy stacks | ❌ | ✅ | ✅ |
| Manage nodes, networks, volumes, secrets, configs | ❌ | ✅ | ✅ |
| Manage registries | ❌ | ❌ | ✅ |

- **Global Role:** Governs portal-level administration (users, audit, auth settings).
- **Per-App Tier:** Governs what you can do *inside* an app, derived via Settings → Apps & Access.

---

## 🧩 How "Stacks" Work

Docker Swarm has no native stack API. KNetraHub parses your compose YAML, ensures declared overlay networks exist, and creates/updates services with the `com.docker.stack.namespace` label. It warns rather than failing on unsupported compose directives.

---

## 🗺️ Roadmap & Limitations

**Currently Implemented:**
- Live read + control for Docker resources.
- LDAP/OIDC auth with JWT/RBAC.
- GitLab commit history and rollback.
- Alerting and encrypted credential storage.
- Working Module Federation portal shell.

**To-Be Built:**
- Real KNetraHub-Server & KNetraHub-IPMgt modules.
- Real agent collectors for server/network/asset modes.
- Container exec/terminal.
- Webhook-driven GitOps redeploys.

**Limitations:**
- A federated component runs inside the portal's Vue instance. `useRuntimeConfig()` resolves to the portal's config. Use Vite's `define` for remote configurations.

---

## 🛠️ Tech Stack

- **Portal:** Nuxt 4 (Nitro + Vue 3), Nuxt UI 4, Tailwind v4, dockerode, ldapts, jose, Postgres + TimescaleDB.
- **Remote (KNetraHub-Net):** Nuxt 4 (CSR-only), `@module-federation/vite`.
- **API (KNetraHub-Net-API):** Standalone Nitro, `pg`, `jose`.

---

## 📝 License & Author

**Author:** Seng Phirum — [sengphirum143@gmail.com](mailto:sengphirum143@gmail.com)

MIT © 2026 Seng Phirum

See [LICENSE](./LICENSE) for full details.
