# DockHub

**Run your Docker Swarm from one hub.** A modern, responsive web console for managing Docker Swarm clusters - built in the spirit of Swarmpit, with the operational depth of Portainer and the GitOps convenience of Dokploy.

DockHub gives you live control of nodes, services, stacks, tasks, networks, volumes, secrets, and configs from a single operations hub - with **LDAP authentication**, **role-based access control**, and **GitLab-backed versioning** of every stack's compose file so you can see history and roll back with one click.

Built on **Nuxt 4** + **Nuxt UI 4** + **Tailwind v4**.

---

## Highlights

- **Live swarm control** - nodes (drain/pause/activate, promote/demote, labels, remove), services (scale, redeploy, rolling image updates, logs, delete), tasks, and raw containers.
- **Stacks, versioned in Git** - deploy stacks from compose YAML; every deploy is committed to GitLab first, giving you a full change history and one-click **rollback** to any previous commit.
- **Data resources** - create and manage overlay networks, volumes, secrets (write-only), and configs.
- **Auth & RBAC** - local accounts *and* LDAP login, with three roles: `viewer` (read-only), `operator` (deploy/scale/manage), and `admin` (users, registries, audit).
- **Audit log** - every state-changing action is recorded with actor, target, and detail.
- **Private registries** - store pull credentials for private image registries.
- **Responsive by design** - works from a phone on the server-room floor to an ultrawide on your desk.

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

## Production build

```bash
npm run build
node .output/server/index.mjs
```

## Deploy onto the swarm itself

DockHub ships with a `Dockerfile` and a `docker-compose.yml` that runs it as a swarm service, pinned to a manager node:

```bash
docker build -t dockhub:latest .
docker stack deploy -c docker-compose.yml dockhub
```

The compose file mounts the Docker socket read-only and a named volume for DockHub's own database, with a `node.role == manager` placement constraint.

If your network injects an internal or self-signed root CA, pass that CA into the build so npm can trust it:

```bash
docker build --secret id=npm_ca,src=company-root-ca.crt -t dockhub:latest .
```

On networks that intercept TLS, the Docker build defaults to relaxed npm certificate validation so the image can still be built. If you want to force strict validation during the build, use:

```bash
docker build --build-arg NPM_CONFIG_STRICT_SSL=true -t dockhub:latest .
```

Keeping strict validation disabled is convenient on trusted corporate networks, but the CA-secret approach above is the safer long-term option.

---

## Configuration

Everything is configured through environment variables (full list in [`.env.example`](./.env.example)). The most important ones:

| Variable | Purpose |
| --- | --- |
| `NUXT_JWT_SECRET` | Signs session cookies - **set a long random value in production**. |
| `NUXT_DOCKER_SOCKET_PATH` | Docker socket path (default `/var/run/docker.sock`). |
| `NUXT_DOCKER_HOST` / `NUXT_DOCKER_PORT` | Use a remote engine over TCP instead of the socket. Add `NUXT_DOCKER_CA` / `CERT` / `KEY` for TLS. |
| `NUXT_ADMIN_USERNAME` / `NUXT_ADMIN_PASSWORD` | First-run admin seed. |

### LDAP

Set `NUXT_LDAP_ENABLED=true` and provide your directory details (`NUXT_LDAP_URL`, `BIND_DN`, `BIND_CREDENTIALS`, `SEARCH_BASE`, and an optional `SEARCH_FILTER`, default `(uid={{username}})`). Login then tries LDAP first and falls back to local accounts. Map directory groups to roles with `NUXT_LDAP_ADMIN_GROUP` and `NUXT_LDAP_OPERATOR_GROUP`; everyone else becomes a `viewer`. LDAP users are upserted into the local store on first login so they appear in the Users page.

### GitLab stack versioning

Provide a GitLab token with **`api`** scope and a target project:

```text
NUXT_GITLAB_TOKEN=glpat-...
NUXT_GITLAB_PROJECT_ID=12345678
NUXT_GITLAB_BRANCH=main          # default
NUXT_GITLAB_STACKS_PATH=stacks   # default
```

Each stack is stored at `stacks/<name>.yml`. Deploying or editing a stack commits the new compose file (so the desired state is recorded even if the deploy fails), and the stack detail page shows the commit timeline with view + rollback. When GitLab isn't configured, stacks still deploy - they just aren't versioned.

---

## Roles

| Capability | viewer | operator | admin |
| --- | :---: | :---: | :---: |
| View everything | yes | yes | yes |
| Scale / redeploy / deploy stacks |  | yes | yes |
| Manage nodes, networks, volumes, secrets, configs |  | yes | yes |
| Manage users, registries, view audit log |  |  | yes |

---

## How "stacks" work

Docker Swarm has no native stack API - `docker stack` is a client-side convention built on the `com.docker.stack.namespace` label. DockHub follows the same convention: it parses your compose YAML, ensures declared overlay networks exist, and creates or updates each service (named `<stack>_<service>`) with that label, pruning services you remove. It supports the common compose subset - image, command, environment, `deploy` (replicas/mode/resources/restart_policy/placement/update_config/labels), ports (short and long form), networks, volumes/mounts, and healthcheck - and surfaces a warning rather than failing on directives it doesn't translate.

---

## What's implemented vs. roadmap

This is a real, runnable foundation that implements the core of every area above against the live Docker Engine API. In the interest of honesty:

**Implemented:** live read + control for nodes/services/stacks/tasks/networks/volumes/secrets/configs/containers; local + LDAP auth with JWT/RBAC; GitLab commit history and rollback; audit logging; private registry storage; service log viewing (tail); responsive UI throughout.

**Natural next steps (roadmap):** streaming/live-follow logs over WebSockets, per-task CPU/memory metrics and charts, container exec/terminal, compose validation with a richer translator, multi-cluster endpoints, webhook-driven GitOps redeploys, and 2FA. The architecture leaves clean seams for each.

---

## Tech

Nuxt 4 (Nitro server + Vue 3) · Nuxt UI 4 · Tailwind v4 · dockerode · ldapts · jose (JWT) · lowdb · GitLab REST v4. Single deployable Node server - no external database required.

---

## Author

**Seng Phirum** — [sengphirum143@gmail.com](mailto:sengphirum143@gmail.com)

---

## License

MIT © 2026 Seng Phirum

See [LICENSE](./LICENSE) for the full text.
