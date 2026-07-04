# KNetraHub v0.1.1

Date: 2026-07-04 UTC

## Docker Images

- `registry.kdsb.com.kh/knetrahub/app:0.1.1`
- `registry.kdsb.com.kh/knetrahub/app:latest`
- `registry.kdsb.com.kh/knetrahub/agent:0.1.1`
- `registry.kdsb.com.kh/knetrahub/agent:latest`

## Source

- Commit: `d038f7f`
- Previous tag: none

## Changes

- feat: add file environment variable resolution for KNETRAHUB_AGENT_TOKEN and update docker-compose for compatibility (d038f7f)
- feat: update release notes for v0.1.1 with health check endpoint and database readiness enhancements (fc428d9)
- feat: add health check endpoint and enhance database readiness handling in entrypoint (2955e57)
- feat: add NUXT_JWT_SECRET and NUXT_AGENT_TOKEN to environment variable setup (82bac79)
- feat: introduce manager role and enhance user authority management (264b841)
- feat: update plugins to skip execution in static docs build (7d69a51)
- feat: update deployment workflow to use pnpm and enhance app launch experience (8e44595)
- feat: Enhance device management and SNMP trap handling (04054bd)
- feat: release v0.1.1 with enhanced Monitoring module and new import/export features (f47f8f8)
- feat: deepen Monitoring maps/web/SLA + unify Network+Server nav and Problems (8fa4fb2)
- feat: rebuild Monitoring app (Network+Server merge, sensor graphs, Zabbix server clone) (a665ae4)
- feat: merge Network and Server modules into a unified Monitoring module with new routes and components feat: implement network settings page with device templates, categories, and poller summary feat: add syslog page for real-time device event logs feat: create host metrics page for server monitoring with detailed information feat: develop server dashboard with active problems and recent alerts overview feat: enhance permissions and roles for the new Monitoring module chore: update app routes to reflect the new Monitoring structure and remove legacy paths chore: refactor module registry to include Monitoring and remove old Network and Server entries fix: ensure proper access control for Monitoring features based on user permissions (29ed5f7)
- feat: Network module enhancements + Docker registry image browser (3d8875c)
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
 M RELEASE_NOTES.md
 M app/composables/useNav.ts
 M app/pages/ipmgt/index.vue
 M app/pages/ipmgt/settings.vue
 M app/pages/ipmgt/subnets/[id].vue
 M app/pages/ipmgt/subnets/index.vue
 M release-notes/v0.1.1.md
 M server/api/ipmgt/subnets/[id]/index.get.ts
 M server/api/ipmgt/subnets/[id]/ips.get.ts
 M server/api/ipmgt/subnets/index.get.ts
 M server/plugins/seedSubsystems.ts
 M server/utils/db.ts
 M shared/utils/permissions.ts
?? app/components/ipam/
?? app/composables/useIpam.ts
?? app/pages/ipmgt/addresses/
?? app/pages/ipmgt/search.vue
?? app/pages/ipmgt/sections/
?? app/pages/ipmgt/tools.vue
?? app/pages/ipmgt/vlans/
?? app/pages/ipmgt/vrfs/
?? server/api/ipmgt/addresses/
?? server/api/ipmgt/calculator.get.ts
?? server/api/ipmgt/dashboard.get.ts
?? server/api/ipmgt/l2domains/
?? server/api/ipmgt/search.get.ts
?? server/api/ipmgt/sections/
?? server/api/ipmgt/settings.get.ts
?? server/api/ipmgt/settings.put.ts
?? server/api/ipmgt/subnets/[id]/first-free.get.ts
?? server/api/ipmgt/subnets/[id]/index.delete.ts
?? server/api/ipmgt/subnets/[id]/index.put.ts
?? server/api/ipmgt/subnets/[id]/reserve.post.ts
?? server/api/ipmgt/subnets/index.post.ts
?? server/api/ipmgt/vlans/
?? server/api/ipmgt/vrfs/
?? server/utils/ipam.ts
?? server/utils/ipamStore.ts
```
