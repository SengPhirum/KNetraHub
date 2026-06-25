# DockHub v0.1.1

Date: 2026-06-25 UTC

## Docker Images

- `registry.kdsb.com.kh/dockhub/app:0.1.1`
- `registry.kdsb.com.kh/dockhub/app:latest`
- `registry.kdsb.com.kh/dockhub/agent:0.1.1`
- `registry.kdsb.com.kh/dockhub/agent:latest`

## Source

- Commit: `072fef6`
- Previous tag: none

## Changes

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
M  README.md
A  app/components/AppSettingsScaffold.vue
 M app/components/SidebarNav.vue
MM app/composables/useNav.ts
 M app/composables/usePreferences.ts
 M app/layouts/default.vue
R  app/pages/docker.vue -> app/pages/docker/index.vue
A  app/pages/docker/settings.vue
M  app/pages/docs/configuration.vue
M  app/pages/docs/manual.vue
M  app/pages/documentation.vue
 M app/pages/index.vue
A  app/pages/ipmgt/settings.vue
A  app/pages/net/settings.vue
 M app/pages/preferences/index.vue
A  app/pages/server/settings.vue
MM app/pages/settings/index.vue
 M server/api/auth/logout.post.ts
 M server/api/user/preferences.patch.ts
 M server/utils/auth.ts
 M server/utils/db.ts
M  server/utils/gitlab.ts
 M server/utils/store.ts
?? app/components/AppLauncher.vue
?? app/middleware/admin.ts
?? app/pages/admin/
?? app/pages/preferences/appearance.vue
?? app/pages/preferences/info.vue
?? app/pages/preferences/login-activity.vue
?? app/pages/preferences/notifications.vue
?? app/pages/preferences/password.vue
?? app/pages/preferences/profile.vue
?? app/pages/preferences/sessions.vue
?? app/pages/preferences/tokens.vue
?? app/pages/preferences/two-factor.vue
?? server/api/user/login-activity.get.ts
?? server/api/user/profile.patch.ts
?? server/api/user/sessions/
```
