# KNetraHub v0.1.1

Date: 2026-06-25 UTC

## Docker Images

- `registry.kdsb.com.kh/knetrahub/app:0.1.1`
- `registry.kdsb.com.kh/knetrahub/app:latest`
- `registry.kdsb.com.kh/knetrahub/agent:0.1.1`
- `registry.kdsb.com.kh/knetrahub/agent:latest`

## Source

- Commit: `a0593e2`
- Previous tag: none

## Changes

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
 M Dockerfile
 M RELEASE_NOTES.md
 M app/components/DocsSidebar.vue
 M app/layouts/default.vue
 M app/pages/documentation.vue
 M release-notes/v0.1.1.md
 M server/api/swagger/index.get.ts
```
