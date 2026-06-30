# KNetraHub v0.1.1

Date: 2026-06-30 UTC

## Docker Images

- `registry.kdsb.com.kh/knetrahub/app:0.1.1`
- `registry.kdsb.com.kh/knetrahub/app:latest`
- `registry.kdsb.com.kh/knetrahub/agent:0.1.1`
- `registry.kdsb.com.kh/knetrahub/agent:latest`

## Source

- Commit: `8d20205`
- Previous tag: none

## Changes

- feat: add SNMP v3 support with credential management in device forms feat: implement network dashboards with CRUD operations and metrics tracking feat: enhance metrics collection for network devices with latency and availability data chore: update release notes for v0.1.1 with recent changes and commits fix: ensure app settings are accessible post-deployment without migration errors (8d20205)
- chore: remove unused knetrahub-net-api service (19c36a4)
- feat: add support for developer-specific corporate/AV root CAs in Docker setup (ac5a2af)
- feat: add network sensors page with real-time monitoring and filtering (05b9708)
- feat: add caption support to KNetraHubLogo and integrate app name in SidebarNav (8457afc)
- chore: update release notes for v0.1.1 with recent changes and commits (92568bb)
- fix: open API docs in new tab, tidy branding, fix Docker pnpm build (d4d6334)
- chore: migrate to pnpm, rebrand to KNetraHub, and enhance README (a0593e2)
- docs: refactor README with structured Table of Contents, updated feature descriptions, and enhanced architectural overview (d75285a)
- Update .env example (84c573b)
- Merge pull request #1 from SengPhirum/restructure-portal-and-prefs (08b6723)
- Restructure portal: per-app settings, sectioned admin/preferences, full-page home (1edad5c)
- feat: implement LibreNMS feature parity for Network module (072fef6)
- Update (ae8fd24)
- Add KNetraHub portal: app launcher, per-app Keycloak access, new logo (f7ee0d2)
- Update (e146779)
- Add GitLab UI config, alerting, stack GitLab deletion, and icon branding (c1061f4)
- Enhance dashboard and dev swarm (e8a09df)
- Add full service editing, autoredeploy, appearance settings, and fix PWA (392598f)
- Enhance UI (0cb4a52)
- Update enhance all view (f89e508)
- Enhance Stack and Service view (14e562d)
- Enhance stack detail view (e728f76)
- Update replase sqlite with timescaledb and fix some issue (527d233)
- Enhance node display and added search text + sort function (e9244ab)
- Update (8201988)
- Update (3743019)
- Update (d054b0f)
- feat: add per-node usage agent, release tooling, and local dev swarm (0e13929)
- Update doc page (05d0b3e)
- feat: add unified public /documentation page with static docs build (79d5ae7)
- feat: expand settings page with LDAP/OIDC config UI and add docs pages (b35b7b0)
- feat: add Swagger API reference and user API token management (2d16d2e)
- Update setting (7257385)
- feat: add PWA support, DockHubLogo component, and brand icons (2e8f4d2)
- feat: major UX overhaul — SPA cache, Moby Blue theme, roles/settings split, author/license (658e837)
- Init (7cf7e9c)
- Init (33f6c2b)

## Local Changes Included In Build Context

The working tree had uncommitted changes before this release script ran.

```text
 M NETWORK_MONITORING.md
 M RELEASE_NOTES.md
 M app/composables/useNav.ts
 M app/pages/documentation.vue
 M app/pages/net/alerts.vue
 M app/pages/net/devices/[id].vue
 M app/pages/net/devices/index.vue
 M app/pages/net/groups.vue
 M app/pages/net/settings.vue
 M app/pages/registries/index.vue
 M app/utils/appRoutes.ts
 M release-notes/v0.1.1.md
 M server/plugins/netPoller.ts
 M server/utils/db.ts
 M server/utils/registryClient.ts
 M server/utils/store.ts
?? app/pages/registry/
?? app/utils/netCategories.ts
?? app/utils/registryBrowser.ts
?? server/api/net/alerts/
?? server/api/net/devices/[id]/monitoring.post.ts
?? server/api/net/groups.post.ts
?? server/api/net/groups/
?? server/api/net/templates.get.ts
?? server/api/net/templates.post.ts
?? server/api/net/templates/
?? server/api/registries/[id]/
```
