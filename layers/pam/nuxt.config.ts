// KNetraHub PAM (Privileged Access Management) module layer.
//
// Secured credential vault, safes and granular membership, privileged account
// onboarding, automated credential rotation/verification/reconciliation,
// brokered isolated sessions with recording, access requests and multi-level
// approvals, just-in-time access, application/workload secrets, deterministic
// privileged threat analytics, and tamper-evident audit. Mounts at /pam with
// APIs under /api/pam/v1 and an isolated `pam` PostgreSQL schema.
//
// Auto-registered by Nuxt from the layers/ directory: pages, components,
// composables, utils and server routes here merge into the app with the same
// URLs and component names, exactly like the docker / monitoring / ipmgt
// layers. Adding this app needed one moduleCatalog row, its permission/tier
// wiring (shared/utils/permissions.ts), a DB-init branch
// (server/utils/moduleLifecycle.ts) and this layer — no bespoke portal code.
export default defineNuxtConfig({
  $meta: { name: 'pam' }
})
