# DockHub v0.1.8

Date: 2026-06-22 UTC

## Docker Images

- `registry.kdsb.com.kh/dockhub/app:0.1.8`
- `registry.kdsb.com.kh/dockhub/app:latest`
- `registry.kdsb.com.kh/dockhub/agent:0.1.8`
- `registry.kdsb.com.kh/dockhub/agent:latest`

## Source

- Commit: `0cb4a52`
- Previous tag: none

## Changes

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
 M app/app.vue
 M app/components/DockHubLogo.vue
 M app/components/ListControls.vue
 M app/components/PageHeader.vue
 M app/composables/useFormat.ts
 M app/composables/useListControls.ts
 M app/layouts/default.vue
 M app/pages/audit/index.vue
 M app/pages/configs/index.vue
 M app/pages/containers/index.vue
 M app/pages/login.vue
 M app/pages/networks/index.vue
 M app/pages/nodes/index.vue
 M app/pages/registries/index.vue
 M app/pages/secrets/index.vue
 M app/pages/services/[id].vue
 M app/pages/services/index.vue
 M app/pages/settings/index.vue
 M app/pages/stacks/index.vue
 M app/pages/tasks/index.vue
 M app/pages/users/index.vue
 M app/pages/volumes/index.vue
 M nuxt.config.ts
 M release-notes/v0.1.8.md
 M server/api/services/[id].get.ts
 M server/api/services/[id]/image.post.ts
 M server/api/services/[id]/redeploy.post.ts
 M server/api/services/[id]/scale.post.ts
 M server/api/stacks/index.get.ts
 M server/api/tasks/index.get.ts
 M server/utils/openapi.ts
 M server/utils/stack.ts
?? app/components/services/
?? app/composables/useAppearance.ts
?? app/utils/
?? server/api/services/[id]/command.post.ts
?? server/api/services/[id]/configs.post.ts
?? server/api/services/[id]/deployment.post.ts
?? server/api/services/[id]/environment.post.ts
?? server/api/services/[id]/extra-hosts.post.ts
?? server/api/services/[id]/log-driver.post.ts
?? server/api/services/[id]/mounts.post.ts
?? server/api/services/[id]/networks.post.ts
?? server/api/services/[id]/ports.post.ts
?? server/api/services/[id]/resources.post.ts
?? server/api/services/[id]/secrets.post.ts
?? server/api/settings/
?? server/plugins/autoredeploy.ts
?? server/utils/appearanceSettings.ts
?? server/utils/registryClient.ts
?? server/utils/serviceMutation.ts
```
