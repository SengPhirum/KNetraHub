// KNetraHub Work module layer.
//
// Centralized work / project management (ClickUp-equivalent, clean-room):
// workspace → spaces → folders → lists hierarchy, tasks with subtasks,
// multi-assignees, statuses, priorities, tags, checklists, dependencies,
// custom fields, threaded comments with reactions and assigned comments,
// saved views (list/board/table), Docs with page versions, time tracking,
// favorites, permission-aware search, and a full activity trail. Mounts at
// /work with APIs under /api/work/v1 and an isolated `work` PostgreSQL schema
// in the module's dedicated database (Admin → Modules).
//
// Auto-registered by Nuxt from the layers/ directory: pages, components,
// composables, utils and server routes here merge into the app with the same
// URLs and component names, exactly like the docker / monitoring / ipmgt /
// pam layers. Adding this app needed one moduleCatalog row, its
// permission/tier wiring (shared/utils/permissions.ts), a DB-init branch
// (server/utils/moduleLifecycle.ts) and this layer — no bespoke portal code.
//
// Implementation status against the ClickUp 4.0 parity baseline is tracked
// honestly in docs/work/feature-parity-matrix.md — features that are not
// built yet are listed there as such and have no dead UI entry points.
export default defineNuxtConfig({
  $meta: { name: 'work' }
})
