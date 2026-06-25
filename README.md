# KNetraHub

**A portal for everything in your infrastructure, one hub at a time.** KNetraHub (formerly **DockHub**) is the portal shell - login, dashboard, sidebar, permissions, settings - for a growing set of independent operations subsystems, loaded into the shell via **Module Federation**. The first and only fully-built subsystem today is **KNetraHub-Docker**: a complete Docker Swarm management console (live nodes/services/stacks/tasks/networks/volumes/secrets/configs, GitOps stack versioning, alerting, RBAC, audit log).

KNetraHub gives you live control of a Docker Swarm cluster from a single operations hub - with **LDAP/OIDC authentication**, **role-based access control**, **GitLab-backed versioning** of every stack's compose file so you can see history and roll back with one click, and **alerting** (Telegram/Teams/Webhook) when something needs attention. All stored credentials (LDAP, OIDC, registries, GitLab, alert channels) are encrypted at rest. Beyond Docker, the portal can load independently-built **KNetraHub-Net** / **KNetraHub-Server** / **KNetraHub-IPMgt** subsystem UIs at runtime - see [Architecture](#architecture-portal-shell--module-federation) below.

Built on **Nuxt 4** + **Nuxt UI 4** + **Tailwind v4**.

---

## Highlights

- **Live swarm control** - nodes (drain/pause/activate, promote/demote, labels, remove), services (scale, redeploy, rolling image updates, logs, delete), tasks, and raw containers.
- **Stacks, versioned in Git** - deploy stacks from compose YAML; every deploy is committed to GitLab first, giving you a full change history and one-click **rollback** to any previous commit. GitLab is configurable entirely from the Dock app's own settings (Dock -> Settings -> Integrations, no env vars required), with a status dot that's only green when KNetraHub actually reaches GitLab.
- **Alerting** - notify Telegram, Microsoft Teams, or any generic webhook when a deploy fails, a service nears its CPU/memory limit, a node stops reporting, replicas stay degraded, or disk usage crosses a threshold. Each rule has a default message template you can customize with `{{placeholder}}` fields.
- **Data resources** - create and manage overlay networks, volumes, secrets (write-only), and configs.
- **Portal + app launcher** - the home page lists only the apps you can reach (Dock, Net, Server, IP Mgt, …); the sidebar is contextual to the app you're in. Docker management is the built-in **"Dock"** app.
- **Per-app access via Keycloak** - each app is gated independently by realm roles, with a viewer/operator/admin tier per app, mapped in Settings → Apps & Access. The local admin is a break-glass superuser. Enforced server-side at the edge (`server/middleware/appAccess.ts`), so the ~50 existing Docker endpoints need no changes.
- **Auth & RBAC** - local accounts, LDAP, and OIDC SSO; a global role (`viewer`/`operator`/`admin`) for portal administration, plus the per-app tier model above for app access.
- **Encrypted credentials** - LDAP bind password, OIDC client secret, registry auth, GitLab token, and alert channel configs are all encrypted at rest (AES-256-GCM, derived from `NUXT_JWT_SECRET` - no extra key to manage).
- **Module Federation portal shell** - a typed module registry, a `RemoteModuleLoader` that never crashes the host if a remote is offline, and a working example remote (KNetraHub-Net) with its own UI, API, database schema, and auth verification.
- **Audit log** - every state-changing action is recorded with actor, target, and detail.
- **Private registries** - store pull credentials for private image registries.
- **Responsive by design** - works from a phone on the server-room floor to an ultrawide on your desk.

---

## Architecture: portal shell + Module Federation

KNetraHub is split into a **portal** (this repo's `app/` and `server/`) and **subsystems**, each independently buildable/deployable:

```
KNetraHub (portal)              <- login, user prefs, app launcher (home), settings, audit, access control
├── Dock  (KNetraHub-Docker)    <- built in, in-repo app (existing Swarm pages, dashboard at /dock)
├── KNetraHub-Net      (remote)  <- remotes/knetrahub-net + services/knetrahub-net-api
├── KNetraHub-Server   (remote)  <- not built yet, same pattern as KNetraHub-Net
└── KNetraHub-IPMgt    (remote)  <- not built yet, same pattern as KNetraHub-Net
```

The **home page is an app launcher**: it shows only the apps the signed-in user may reach (Dock, Net, Server, IP Mgt, …). The sidebar is **contextual** - it surfaces an app's own navigation only while you're inside that app. The portal **owns**: login/session, user preferences, the launcher, per-app access control, global settings, global audit, and the module registry. It never reads or writes a subsystem's own database.

The existing Docker Swarm management is the first app, **"Dock"**. It stays in this repo (not extracted to a separate remote/service) but is treated as one app among peers: its pages keep their original URLs (`/services`, `/stacks`, …), its dashboard moved from `/` to `/dock`, and access to it is gated exactly like a remote subsystem.

### Per-app access (Keycloak realm roles)

Each app is gated independently by **Keycloak realm roles**, with a **viewer/operator/admin tier per app**. The app→role mapping is configured in **Settings → Apps & Access** (stored in the DB, editable without redeploy), so a realm role like `dock-operator` can grant operator access to Dock without making the user a global admin.

- **Local admin is a break-glass superuser** - it sees every app at admin tier regardless of the map. Other local (non-Keycloak) accounts get no apps by default.
- **Resolution** (`shared/utils/entitlements.ts`): for each app, the user gets the highest tier whose configured realm-role list intersects their realm roles (`realm_access.roles` by default, configurable). The portal resolves this in `/api/auth/me` and returns it as `user.apps`; the client never sees the raw role map.
- **The real boundary is server-side.** `server/middleware/appAccess.ts` gates every Dock API route: it resolves the caller's `docker` tier (403 if none) and publishes it on `event.context.effectiveTier`, so the existing endpoint handlers' `requireRole()`/`requirePermission()` enforce the *per-app* tier with **no handler changes**. Subsystem APIs get the resolved `apps` inside the short-lived subsystem token and enforce it themselves (`services/knetrahub-net-api` checks `apps.net`). A frontend `hasApp()`/`hasPermission()` check is UX only.

> **Behaviour change:** after this, Keycloak users see **no apps until an admin fills in the role map** (or signs in as the local admin). The launcher shows a clear empty state with a link to configure access. LDAP users carry no realm roles yet, so they also get no apps unless promoted to local admin - mapping LDAP groups into the same slot is a documented follow-up.

### Why Module Federation, not iframes

An iframe would isolate a remote's CSS/DOM cleanly, but it can't share the portal's layout, theme, or navigation, and stacking multiple iframes for a "single hub" experience degrades fast. Module Federation loads a remote's actual Vue component into the portal's own page - same sidebar, same header, same Nuxt UI/Tailwind theme - while keeping the remote's code, build, and deploy completely independent. The trade-off, as built here, is that an exposed component runs inside the **portal's** Vue/Nuxt runtime once loaded (see "Known limitations" below), not its own - which is exactly what makes "no second login" work, but means a remote can't rely on its own `useRuntimeConfig()` for anything that has to work both standalone and federated.

### How it works (host side)

1. `app/utils/moduleRegistry.ts` lists every module (key, display name, route, icon, required permission, local vs. remote, remote name/exposed path/entry URL/API base, enabled, order).
2. `app/composables/useNav.ts` builds a **Subsystems** sidebar group from the registry, filtered by `hasPermission()` (`app/composables/useAuth.ts`) - disabled or unauthorized modules just don't appear.
3. Visiting a remote's route (`/net`, `/server`, `/ipmgt`) renders `<RemoteModuleLoader module-key="net" />` inside `<ClientOnly>`. It:
   - fetches a short-lived token from `GET /api/auth/subsystem-token` (same-origin, so the portal's own httpOnly session cookie authenticates it - the remote's JS never touches that cookie directly),
   - registers the remote with `@module-federation/runtime`'s `registerRemotes()` and loads the exposed component with `loadRemote()`,
   - shows a loading skeleton, then either the mounted component (passed the token as an `auth-token` prop) or a friendly "is unavailable" panel with a **Retry** button - it never throws past itself (`onErrorCaptured` contains render-time crashes too), and it POSTs failures to `/api/modules/load-failure` so they show up in the existing Audit log.
4. `app/plugins/module-federation.client.ts` initializes the runtime once and - importantly - **contributes the portal's own Vue instance to the federation share scope**. Skipping this is a real, reproduced bug, not a hypothetical: without it, a remote's `ref()`/`reactive()` calls silently stop updating its own rendered DOM, because the remote falls back to a second, disconnected copy of Vue's reactivity system. See `app/plugins/module-federation.client.ts`'s comment for the exact failure mode.

### How it works (remote side) - KNetraHub-Net as the reference

`remotes/knetrahub-net/` is a separate, independently runnable Nuxt 4 project:

- `ssr: false` - the remote is CSR-only, which sidesteps SSR/Module Federation conflicts entirely (the documented fallback for when full SSR federation is too risky, used here from the start rather than discovered the hard way).
- `@module-federation/vite` exposes `./NetApp` from `app/components/NetApp.vue` and emits `remoteEntry.js`.
- Three non-obvious fixes were needed to get a real remote loading into a real host, all documented inline at the fix site since none of them are obvious from the Module Federation docs alone:
  1. **`remoteEntry.js` doesn't reach `.output/public` on its own.** Nitro only copies assets a page's own `<script>` tags reference; nothing references `remoteEntry.js` (the host fetches it independently), so it's left behind in Nuxt's build cache. Fixed with a `nitro:config` hook that registers that cache directory as an extra `publicAssets` source (`nuxt.config.ts`).
  2. **CORS.** A remote's `remoteEntry.js` and the chunks it imports are loaded as a cross-origin **ES module** by the portal - browsers enforce CORS for module imports (unlike classic `<script>` tags), and once the portal sends an `Authorization` header too, that becomes a full **preflight** the API/remote must answer with a 2xx, not just headers on the real response (`nitro.config.ts`'s `routeRules.cors` only does the latter; `server/middleware/cors.ts` in the API uses h3's `handleCors()` to actually answer the OPTIONS preflight).
  3. **`registerRemotes(...)` needs `type: 'module'`.** Without it the runtime injects a classic `<script>` tag, which throws `Unexpected token 'export'` on Vite's ESM output and fails silently.
- Configuration the remote needs at runtime (its own API base URL) is passed via Vite's `define` (a real compile-time constant), not `useRuntimeConfig()` - see the comment in `remotes/knetrahub-net/nuxt.config.ts` for why `useRuntimeConfig()` doesn't work once federated.

### Adding a new Nuxt remote subsystem

1. Copy `remotes/knetrahub-net/` to `remotes/knetrahub-<name>/`, rename the federation `name`/`exposes` entry, give it its own port.
2. Add a matching entry to `app/utils/moduleRegistry.ts` (key, route, permission, remote name, exposed path) and the matching `NUXT_PUBLIC_KNETRAHUB_<NAME>_REMOTE_ENTRY` / `_API_BASE` env vars.
3. Add the matching permission(s) to `shared/utils/permissions.ts`'s `PERMISSIONS`/`ROLE_PERMISSIONS`.
4. Add a placeholder page (`app/pages/<name>.vue`) following `app/pages/net.vue`'s pattern.
5. Build the subsystem's own API following `services/knetrahub-net-api/`'s pattern (own schema, own migration, own JWT verification, own permission check).

### Database separation

One shared Postgres/TimescaleDB instance, separated by **schema**, not by table prefix or shared tables (Option A from the original design): the portal's own tables stay in `public`; `KNetraHub-Net` owns a `net` schema (`net.devices`, `net.interfaces`, `net.ping_checks`, `net.snmp_metrics`, `net.bandwidth_metrics`) created by its **own** migration in `services/knetrahub-net-api/server/utils/db.ts` - the portal's `server/utils/db.ts` was not touched to build this. `KNetraHub-Server` (`server.nodes`, `server.agent_heartbeats`, `server.cpu_metrics`, `server.memory_metrics`, `server.disk_metrics`, `server.service_status`) and `KNetraHub-IPMgt` (`ipmgt.assets`, `ipmgt.ip_addresses`, `ipmgt.asset_assignments`, `ipmgt.locations`, `ipmgt.warranty_records`, `ipmgt.maintenance_history`) would follow the identical pattern once built. A later stage could split each subsystem onto its own Postgres instance entirely (Option B) without changing this API contract.

### Shared authentication, no second login

The portal handles login and holds the session in an httpOnly cookie - a remote's JavaScript cannot read it, by design (XSS mitigation). `GET /api/auth/subsystem-token` (cookie-authenticated, same-origin) mints a separate, **5-minute**, audience-scoped (`aud: "knetrahub-subsystem"`) JWT signed with the same `NUXT_JWT_SECRET`. `RemoteModuleLoader` fetches it and passes it to the remote as a prop; the remote forwards it as `Authorization: Bearer` to its own API; the API verifies the signature, audience, and expiry independently and checks its own permission - it never trusts the portal or the frontend. A leaked subsystem token is far less useful than the portal session cookie it's derived from (5 minutes vs. 12 hours, and scoped by audience).

### Production deployment notes

| Route | Served by |
| --- | --- |
| `/` | KNetraHub portal - app launcher (home) |
| `/dock`, `/stacks`, `/services`, ... | Dock app (built into this portal), gated by `docker` access |
| `/net`, `/server`, `/ipmgt` | Portal page that loads the remote via Module Federation, gated by per-app access |
| `/remotes/net/remoteEntry.js` (suggested path) | KNetraHub-Net UI container, reverse-proxied |
| `/api/net/*` (suggested path) | KNetraHub-Net-API container, reverse-proxied |

In dev, each remote's own dev server answers `/remoteEntry.js` at its own port (3101/3102/3103). In production, put a reverse proxy in front so each remote is reachable at a stable path under the portal's own origin (avoids a second round of CORS configuration per remote, and lets you swap a remote's container without changing the portal's env vars):

```
location /remotes/net/      { proxy_pass http://knetrahub-net-ui:3101/; }
location /remotes/server/   { proxy_pass http://knetrahub-server-ui:3102/; }
location /remotes/ipmgt/    { proxy_pass http://knetrahub-ipmgt-ui:3103/; }
location /api/net/          { proxy_pass http://knetrahub-net-api:4101/api/; }
location /api/server/       { proxy_pass http://knetrahub-server-api:4102/api/; }
location /api/ipmgt/        { proxy_pass http://knetrahub-ipmgt-api:4103/api/; }
```

With that in place, set `NUXT_PUBLIC_KNETRAHUB_NET_REMOTE_ENTRY=https://your-host/remotes/net/remoteEntry.js` and `NUXT_PUBLIC_KNETRAHUB_NET_API_BASE=https://your-host/api/net` (and the `_SERVER_`/`_IPMGT_` equivalents) on the portal, and the CORS configuration in this repo's example remote/API becomes unnecessary (same-origin once proxied) - it's kept permissive here specifically because local dev runs every piece on a different port.

### Security notes

- Every client check (`hasApp()`/`hasPermission()`, the launcher, the contextual sidebar, `app/middleware/route-access.global.ts`) is **UX only** - hiding a card or menu item, not a security boundary. The Dock boundary is `server/middleware/appAccess.ts`; `services/knetrahub-net-api` independently re-verifies the JWT and re-checks the tier on every request; a new subsystem API must do the same.
- The portal never connects to a subsystem's database. A subsystem's API never connects to the portal's database (`server/utils/db.ts` is untouched by anything in `services/`).
- The subsystem token is short-lived (5 minutes) and audience-scoped specifically so a captured copy is far less valuable than the portal's own session cookie.
- CORS on the example remote/API (`Access-Control-Allow-Origin: *`) is appropriate for public, non-sensitive static JS bundles and a token-gated API, but tighten it to the portal's actual origin in production if you don't put a reverse proxy in front (see above).

### Known limitations

- **A federated component runs inside the portal's Vue/Nuxt instance, not its own.** Confirmed live: `useRuntimeConfig()` inside an exposed component resolves to the *portal's* runtime config once federated (no `apiBase` key), not the remote's - use Vite's `define` for any config a federated component needs (see `remotes/knetrahub-net/nuxt.config.ts`). The remote's own pages (visited directly, not through the portal) don't have this limitation.
- **KNetraHub-Server and KNetraHub-IPMgt are not built** - only KNetraHub-Net exists as a real, working example. The placeholder routes (`/server`, `/ipmgt`) correctly show "unavailable" with a Retry button until their remotes/APIs exist.
- **Schema separation covers new subsystems only.** The portal's existing tables (`users`, `app_settings`, `audit`, `alert_channels`, ...) still live in the `public` schema; moving them into a `core`/`docker` schema would touch every existing query and was out of scope for this pass.
- **Renaming is partial, deliberately.** See "Migration plan" below for exactly what's renamed vs. deferred.

### Migration plan: DockHub → KNetraHub

Renamed (safe, cosmetic, zero stored-state impact): every user-visible string (page titles, login screen, sidebar, in-app docs), `package.json`'s name/description, the default app name (`NUXT_PUBLIC_APP_NAME` default).

**Deliberately not renamed yet** (each has a real migration cost):
- The session cookie is still named `dockhub_token` - renaming it logs out every active session on deploy.
- Production image names (`registry.kdsb.com.kh/dockhub/app`, `.../dockhub/agent`), the Postgres database name (`dockhub`), and the swarm stack/service names (`dockhub_app`) in `docker-compose.yml` are live deployment identifiers - renaming them is a coordinated redeploy (new images, updated `docker stack deploy` name, DB rename or fresh DB), not a code change.
- The agent's env vars (`DOCKHUB_AGENT_URL`, `DOCKHUB_AGENT_TOKEN`) keep their names for the same reason; `KNETRAHUB_AGENT_MODE` was added as the new, forward-looking variable instead (see "Agent" below), and `DOCKHUB_AGENT_MODE` works as an alias.
- `app/components/DockHubLogo.vue`'s filename and the actual logo artwork (the SVG still reads "DockHub") are unchanged - only text strings were renamed this pass; the brand mark itself is a design asset, not a string.

### Agent

`agent/index.mjs` is now a small dispatcher, not the collector itself. `KNETRAHUB_AGENT_MODE` (comma-separated, default `docker` - existing deployments that never set this var are unaffected) selects which collector(s) in `agent/collectors/` run: `docker.mjs` is the original Docker Swarm host-stats collector, mechanically extracted with zero behavior change (verified live against this repo's local swarm both before and after the extraction). `server.mjs`/`network.mjs`/`asset.mjs` are stubs that log "not implemented yet" - real implementations would collect their subsystem's data and report it to that subsystem's own API (`POST /api/agent/server-metrics`, etc.), the same way `docker.mjs` reports to the portal's `/api/agent/report`.

---

## Quick start (development)

```bash
npm install
cp .env.example .env          # edit as needed
npm run dev                   # http://localhost:3000
```

DockHub talks to Docker through the socket at `/var/run/docker.sock` by default, so run it **on a swarm manager node** (or point it at a remote engine over TCP - see below). On first run it seeds an admin account:

```text
username: admin
password: admin
```

Override the seed with `NUXT_ADMIN_USERNAME` / `NUXT_ADMIN_PASSWORD`, and **change it immediately** in production. Always set a strong `NUXT_JWT_SECRET`.

### Running the portal with a remote subsystem (Module Federation)

To see KNetraHub-Net loaded into the portal, run all three pieces together:

```bash
npm run dev:mf
```

This uses `concurrently` to run the portal (`npm run dev`, :3000), the KNetraHub-Net remote UI (`npm run dev:net-remote`, :3101), and KNetraHub-Net-API (`npm run dev:net-api`, :4101) side by side. Visit <http://localhost:3000/net> once all three have started. Each piece can also be run/stopped independently with `npm run dev:net-remote` / `npm run dev:net-api` - the portal shows a friendly "unavailable, Retry" panel instead of crashing if the remote or its API isn't running. See `remotes/knetrahub-net/README.md` and `services/knetrahub-net-api/README.md` for running those two independently of the portal entirely.

### Local swarm development

To run DockHub against a local disposable swarm instead of your host Docker engine:

```bash
npm run dev:swarm
```

This uses [`docker-compose.dev.yml`](./docker-compose.dev.yml) to start:

- `swarm-manager` - lightweight Docker-in-Docker container with Node installed, initialized as the swarm manager.
- `swarm-worker-1` - lightweight Docker-in-Docker container joined as a worker.
- `swarm-worker-2` - optional second worker, enabled only for full cluster tests.

DockHub runs inside `swarm-manager` with `npm run dev` and is available at <http://localhost:3000>. Your local project is bind-mounted into `/workspace`, while Linux `node_modules` and `.nuxt` live in named Docker volumes, so file changes on your machine hot reload the app without mixing Windows and Linux dependencies. The compose file reads your local `.env`, then forces `NUXT_DOCKER_SOCKET_PATH=/var/run/docker.sock` so the app controls the manager container's Docker daemon. This dev-swarm path also sets `NUXT_SSR=false` for browser-first hot reload; normal local dev and production builds keep SSR enabled.

By default the local swarm starts only one worker to keep laptops light. Run the full profile when you need manager-plus-two-worker scheduling coverage:

```bash
npm run dev:swarm:full
```

Set `DOCKER_DIND_IMAGE` in `.env` to pin the Docker Engine image used by the disposable swarm, for example `docker:29-dind`.

Useful commands:

```bash
npm run dev:swarm -- ps
npm run dev:swarm -- logs -f swarm-manager
npm run dev:swarm:down
npm run dev:swarm:reset  # removes the disposable swarm volumes
```

This workflow requires Docker Desktop or a Docker Engine that supports privileged containers.

## Production build

```bash
npm run build
node .output/server/index.mjs
```

## Deploy onto the swarm itself

DockHub ships with a `Dockerfile` and a `docker-compose.yml` that runs it as a swarm service, pinned to a manager node. Build and publish the image to the local registry first:

```bash
./release.sh
```

By default this bumps the patch version, writes release notes to `release-notes/v<version>.md` and `RELEASE_NOTES.md`, then pushes:

```text
registry.kdsb.com.kh/dockhub/app:<version>
registry.kdsb.com.kh/dockhub/app:latest
registry.kdsb.com.kh/dockhub/agent:<version>
registry.kdsb.com.kh/dockhub/agent:latest
```

Useful release variants:

```bash
./release.sh --minor
./release.sh --major
./release.sh --version 1.2.0
./release.sh --no-bump          # test publish without changing package version
./release.sh --no-bump --no-push
./release.sh --tag-prefix v     # publish :v1.2.0 instead of :1.2.0
```

Then deploy the published image:

```bash
docker stack deploy -c docker-compose.yml dockhub
```

The compose file uses `registry.kdsb.com.kh/dockhub/app:latest` and `registry.kdsb.com.kh/dockhub/agent:latest`, mounts the Docker socket read-only, and keeps a named volume for DockHub's own database, with a `node.role == manager` placement constraint for the app service.

If your network injects an internal or self-signed root CA, pass that CA into the build so npm can trust it:

```bash
docker build --secret id=npm_ca,src=company-root-ca.crt -t dockhub:latest .
```

On networks that intercept TLS, the Docker build defaults to relaxed npm/Node certificate validation so the image can still be built. If you want to force strict validation during the build, use:

```bash
docker build --build-arg NPM_CONFIG_STRICT_SSL=true --build-arg NODE_TLS_REJECT_UNAUTHORIZED=1 -t registry.kdsb.com.kh/dockhub/app:latest .
```

Keeping strict validation disabled is convenient on trusted corporate networks, but the CA-secret approach above is the safer long-term option.

---

## Configuration

Everything is configured through environment variables (full list in [`.env.example`](./.env.example)). The most important ones:

| Variable | Purpose |
| --- | --- |
| `NUXT_JWT_SECRET` | Signs session cookies and derives the key used to encrypt stored credentials - **set a long random value in production**. |
| `NUXT_DOCKER_SOCKET_PATH` | Docker socket path (default `/var/run/docker.sock`). |
| `NUXT_DOCKER_HOST` / `NUXT_DOCKER_PORT` | Use a remote engine over TCP instead of the socket. Add `NUXT_DOCKER_CA` / `CERT` / `KEY` for TLS. |
| `NUXT_ADMIN_USERNAME` / `NUXT_ADMIN_PASSWORD` | First-run admin seed. |
| `NUXT_DB_HOST` / `PORT` / `NAME` / `USER` / `PASSWORD` / `SSL` / `POOL_MAX` | Postgres + TimescaleDB connection - stores app data (users, settings, audit) and metrics history. |
| `NUXT_METRICS_RETENTION_DAYS` | How many days of node/container/disk/network metrics history to keep (default `30`). |
| `NUXT_PUBLIC_KNETRAHUB_NET_REMOTE_ENTRY` / `_API_BASE` | Where the portal looks for the KNetraHub-Net remote's `remoteEntry.js` and API. Defaults to `http://localhost:3101/remoteEntry.js` / `http://localhost:4101/api`. |
| `NUXT_PUBLIC_KNETRAHUB_SERVER_REMOTE_ENTRY` / `_API_BASE` | Same, for KNetraHub-Server (not built yet - reserved). Defaults to ports 3102 / 4102. |
| `NUXT_PUBLIC_KNETRAHUB_IPMGT_REMOTE_ENTRY` / `_API_BASE` | Same, for KNetraHub-IPMgt (not built yet - reserved). Defaults to ports 3103 / 4103. |

Most integrations below (GitLab, LDAP, OIDC) follow the same pattern: an env var sets the **default**, and saving the equivalent form in **Settings** writes a **database override** that takes precedence until you reset it. Any credential field saved this way (passwords, tokens, client secrets) is encrypted at rest.

### Appearance

Settings -> Appearance lets an admin rebrand the running app without a rebuild: app name, primary brand color, the horizontal logo (login screen), the icon logo (sidebar/header), the **favicon** (browser tab icon), and the **PWA/app icon** (installed-app and home-screen icon, used for the manifest icons and the Apple touch icon). Each image is uploaded directly in the browser and stored inline (capped at 1.5 MB per image) - no object storage or extra volume needed. Changes preview live across the whole app as you edit, and aren't shared with other users until you click Save; "Reset to defaults" reverts to the built-in DockHub branding. The favicon and PWA icon take effect immediately for new visits - no rebuild or redeploy required, since `/manifest.webmanifest` is generated per-request from the current settings rather than baked in at build time.

### LDAP

Set `NUXT_LDAP_ENABLED=true` and provide your directory details (`NUXT_LDAP_URL`, `BIND_DN`, `BIND_CREDENTIALS`, `SEARCH_BASE`, and an optional `SEARCH_FILTER`, default `(uid={{username}})`). Login then tries LDAP first and falls back to local accounts. Map directory groups to roles with `NUXT_LDAP_ADMIN_GROUP` and `NUXT_LDAP_OPERATOR_GROUP`; everyone else becomes a `viewer`. LDAP users are upserted into the local store on first login so they appear in the Users page.

### OIDC single sign-on

Set `NUXT_OIDC_ENABLED=true` and point DockHub at your provider (`NUXT_OIDC_ISSUER`, `NUXT_OIDC_CLIENT_ID`, `NUXT_OIDC_CLIENT_SECRET`). DockHub runs the standard authorization-code flow with PKCE and discovers endpoints from `{issuer}/.well-known/openid-configuration`, so it works with Keycloak, Authentik, Entra ID, Okta, Google, and friends. Register `{your-dockhub-url}/api/auth/oidc/callback` as an allowed redirect URI (override with `NUXT_OIDC_REDIRECT_URI` if DockHub sits behind a proxy that rewrites the origin).

Group mapping works like LDAP: the claim named by `NUXT_OIDC_GROUPS_CLAIM` (default `groups`, dot-paths like `realm_access.roles` supported) is matched against `NUXT_OIDC_ADMIN_GROUP` and `NUXT_OIDC_OPERATOR_GROUP`; everyone else becomes a `viewer`. Roles are re-evaluated on every login. The username comes from `NUXT_OIDC_USERNAME_CLAIM` (default `preferred_username`), and OIDC users are upserted into the local store so they appear in the Users page. A "Continue with SSO" button appears on the login page (label via `NUXT_OIDC_PROVIDER_NAME`); local accounts keep working alongside.

### GitLab stack versioning

Configure GitLab either via environment variables (first-run defaults) or entirely from the Dock app's own admin settings, **Dock -> Settings -> Integrations** (saved as an encrypted database override - no container restart needed). GitLab versioning is specific to the Docker app, so its configuration lives with that app rather than in the portal-wide settings:

```text
NUXT_GITLAB_URL=https://gitlab.com   # default
NUXT_GITLAB_TOKEN=glpat-...          # needs api scope
NUXT_GITLAB_PROJECT_ID=12345678
NUXT_GITLAB_BRANCH=main              # default
NUXT_GITLAB_STACKS_PATH=stacks       # default
```

Each stack is stored at `stacks/<name>.yml`. Deploying or editing a stack commits the new compose file (so the desired state is recorded even if the deploy fails), and the stack detail page shows the commit timeline with view + rollback - the commit author is the full name of the DockHub user who triggered the change, so history stays attributable. When GitLab isn't configured, stacks still deploy - they just aren't versioned.

The status dot next to GitLab in Settings is only green when DockHub actually reached GitLab with a working token - it distinguishes "not configured", "unreachable", and "invalid token" rather than just checking that fields are filled in. Removing a stack's running services (Remove) leaves its compose file in GitLab so history isn't lost; once a stack shows **Defined** (tracked in GitLab but not currently deployed), a second action - **Delete from GitLab** - is available from the stacks list or the stack page to permanently delete the compose file and history too. Both prompt for confirmation since they can't be undone.

### Alerts

Configure notification channels and alert rules from the Dock app's own admin settings, **Dock -> Settings -> Alerts** (Swarm alerting belongs to the Docker app, so it lives with that app rather than in the portal-wide settings). Three channel types are supported - Telegram (bot token + chat ID), Microsoft Teams (incoming webhook URL), and a generic Webhook (URL + custom headers) - and channel credentials are encrypted at rest like everything else. Add as many channels as you like; every enabled channel receives every alert that fires.

Five alert rules ship with sensible defaults, each independently enabled/disabled and configurable:

| Rule | Trigger |
| --- | --- |
| Deploy failed | A stack deploy, rollback, redeploy, image update, or scale operation fails. |
| Service usage threshold | A service's CPU and/or memory usage crosses a configurable percentage (default 90%) of its limit/reservation/node capacity. |
| Node down | A swarm node stops reporting heartbeats. |
| Replicas degraded | A service stays under its desired replica count for longer than a configurable grace period. |
| Disk usage threshold | A node's disk usage crosses a configurable percentage (default 85%). |

Each rule has a default message template using `{{placeholder}}` fields (for example `{{target}}`, `{{error}}`, `{{cpuPercent}}`) - customize the template per rule from its card in Settings, or reset it back to the default at any time. The four threshold/health rules are checked on a poller (default every 3 minutes); deploy failures alert immediately.

```text
NUXT_ALERTS_ENABLED=true            # default
NUXT_ALERTS_INTERVAL_MINUTES=3      # default; how often threshold/health rules are checked
```

---

## Roles & tiers

There are two layers:

- **Global role** (`viewer`/`operator`/`admin`) - governs **portal-level administration** (managing users, the app-role map, audit, auth/integration settings). The local admin (or an OIDC admin group) is a global admin.
- **Per-app tier** (`viewer`/`operator`/`admin`, one per app) - governs what you can do **inside** an app, derived from Keycloak realm roles via Settings → Apps & Access. See "Per-app access" above.

| Capability (within an app you can reach) | viewer | operator | admin |
| --- | :---: | :---: | :---: |
| View everything | yes | yes | yes |
| Scale / redeploy / deploy stacks |  | yes | yes |
| Manage nodes, networks, volumes, secrets, configs |  | yes | yes |
| Manage registries (Dock admin) |  |  | yes |

`shared/utils/permissions.ts` defines the per-app permission sets (`APP_PERMISSIONS[app][tier]`); `shared/utils/entitlements.ts` resolves a user's tier per app. `server/utils/auth.ts`'s `requireRole()`/`requirePermission()` now consult `event.context.effectiveTier` (set by `server/middleware/appAccess.ts`) for app-scoped routes, falling back to the global role for portal routes - so the ~50 existing Docker endpoints enforce per-app tiers **without being edited**. Portal-admin endpoints (users, settings, audit) still gate on the global `admin` role.

---

## How "stacks" work

Docker Swarm has no native stack API - `docker stack` is a client-side convention built on the `com.docker.stack.namespace` label. DockHub follows the same convention: it parses your compose YAML, ensures declared overlay networks exist, and creates or updates each service (named `<stack>_<service>`) with that label, pruning services you remove. It supports the common compose subset - image, command, environment, `deploy` (replicas/mode/resources/restart_policy/placement/update_config/labels), ports (short and long form), networks, volumes/mounts, and healthcheck - and surfaces a warning rather than failing on directives it doesn't translate.

---

## What's implemented vs. roadmap

This is a real, runnable foundation that implements the core of every area above against the live Docker Engine API. In the interest of honesty:

**Implemented and verified end-to-end (real builds, real browser, real DB):** live read + control for nodes/services/stacks/tasks/networks/volumes/secrets/configs/containers; local + LDAP + OIDC auth with JWT/RBAC; GitLab commit history and rollback, fully UI-configurable; encrypted credential storage; alerting to Telegram/Teams/Webhook with customizable templates; per-node/container metrics history (Postgres + TimescaleDB) with charts on node and service pages; audit logging; private registry storage; service log viewing (tail); responsive UI throughout; **a working Module Federation portal shell** - typed module registry, permission-filtered sidebar, `RemoteModuleLoader` with real offline-fallback behavior, and one complete example remote (KNetraHub-Net UI → its own API → its own `net`-schema Postgres tables → back to the portal's dashboard), all running as separate processes with independent auth verification.

**Mock/placeholder data still:** the dashboard's Network/Server/IP-Asset summary cards (static numbers); KNetraHub-Net's own dashboard falls back to mock numbers only if its API is unreachable (real numbers otherwise, from real seed rows).

**Scaffolded, not fully built:** KNetraHub-Server and KNetraHub-IPMgt (remotes and APIs) - same pattern as KNetraHub-Net, not yet duplicated; `agent/collectors/server.mjs`/`network.mjs`/`asset.mjs` (log "not implemented", don't collect anything yet).

**Natural next steps (roadmap):** build out KNetraHub-Server/-IPMgt following the KNetraHub-Net pattern; real collectors for the agent's server/network/asset modes; streaming/live-follow logs over WebSockets; container exec/terminal; compose validation with a richer translator; multi-cluster endpoints; webhook-driven GitOps redeploys; 2FA; splitting `remotes/knetrahub-net` and `services/knetrahub-net-api` into their own repositories once they outgrow living next to the portal.

---

## Tech

**Portal:** Nuxt 4 (Nitro server + Vue 3) · Nuxt UI 4 · Tailwind v4 · dockerode · ldapts · jose (JWT) · Postgres + TimescaleDB (`pg`) · chart.js · GitLab REST v4 · `@module-federation/runtime` (host-side, no build plugin needed).

**Example remote (KNetraHub-Net):** Nuxt 4 (CSR-only) · `@module-federation/vite` · Tailwind v4.

**Example subsystem API (KNetraHub-Net-API):** standalone Nitro (`nitropack`) · `pg` · `jose`.

Single deployable Node server for the portal; each subsystem (remote UI + API) is an independently deployable Node server too.

---

## Author

**Seng Phirum** — [sengphirum143@gmail.com](mailto:sengphirum143@gmail.com)

---

## License

MIT © 2026 Seng Phirum

See [LICENSE](./LICENSE) for the full text.
