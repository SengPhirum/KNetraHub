// Monitoring module layer — LibreNMS-equivalent monitoring platform.
//
// One unified device model (routers, switches, firewalls, servers, printers,
// UPSes, … are all "devices" with discovered capabilities), modular discovery
// and polling engines driven by a durable DB-backed job queue, health sensors,
// alerting, SNMP traps, syslog, active service checks, and data-collection
// completeness auditing. UI under /monitoring, API under /api/monitoring/v1,
// database objects in the dedicated `monitoring` Postgres schema.
//
// Auto-registered by Nuxt from the layers/ directory. See
// docs/monitoring/architecture.md for the full design.
export default defineNuxtConfig({
  $meta: { name: 'monitoring' }
})
