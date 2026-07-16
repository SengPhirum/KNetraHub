# Legacy Monitoring Removal Report

> Executed 2026-07-16. Companion to
> [`legacy-monitoring-inventory.md`](./legacy-monitoring-inventory.md) (what existed) and
> [`legacy-monitoring-cleanup-report.json`](./legacy-monitoring-cleanup-report.json)
> (machine-readable listing).

## Recovery references

| Ref | Value |
|---|---|
| Commit before removal | `c135e432d815fb4d08a7622747c04d197530179e` |
| Backup branch | `backup/legacy-monitoring-before-librenms-rebuild` |
| Backup tag | `legacy-monitoring-final` |
| Schema export | [`legacy-monitoring-schema.sql`](./legacy-monitoring-schema.sql) (code-derived DDL; live DB was not reachable at export time) |

## 1. Deleted outright

- **`layers/monitoring/` — all 173 files** (pages, components, composables,
  utils, 4 Nitro plugins, ~110 API handlers, SSE stream, import/export,
  Zabbix-style provisioning). Full listing: inventory §2 / cleanup JSON.

## 2. Removed from shared files (files kept, legacy content removed)

| File | What was removed |
|---|---|
| `server/utils/db.ts` | 513 lines of legacy DDL: all 35 `net_*`/`server_*` tables + indexes (lines 252–764) |
| `server/utils/metrics.ts` | `net_metrics`, `net_sensor_readings`, `server_item_history` hypertables + their retention entries + `recordNetSample`/`recordSensorReadings`/`recordServerItemSample` |
| `server/plugins/seedSubsystems.ts` | net probe/alert-rule seeding, Zabbix host-group/template/item/trigger seeding (`seedServerConfig`, `ensureTemplate`, `seedTemplateItems`, `seedTemplateTriggers`) |
| `scripts/seed.mjs` | `net_devices`/`net_interfaces`/`net_sensors`/`server_hosts`/`server_problems` demo fixtures |
| `scripts/qa-fixtures.mjs` | all `qa-net-*`/`qa-server-*` fixture rows and their cleanup entries |
| `scripts/smart-qa.mjs` | visits to `/monitoring/network/*` and `/monitoring/server/*` (replaced with new-route visits) |
| `nuxt.config.ts` | `runtimeConfig.net` (8 env vars) and `runtimeConfig.server` (12 env vars) blocks |
| `server/middleware/appAccess.ts` | `/api/net` + `/api/server` prefixes (replaced by `/api/monitoring`) |
| `server/utils/moduleLogs.ts` | `/api/net` + `/api/server` prefixes (replaced by `/api/monitoring`) |
| `app/composables/useNav.ts` | Zabbix/PRTG-derived `MONITORING_GROUPS` (Problems, Hosts, Latest data, Templates, Triggers, Web…) — replaced by the LibreNMS-equivalent tree |
| `app/middleware/legacy-monitoring.global.ts` | rewritten: old `/net/*`, `/server/*` and gen-2 `/monitoring/network|server/*` routes now redirect to the new unified pages |
| `app/utils/moduleRegistry.ts`, `app/utils/fileIO.ts`, `app/pages/documentation.vue`, `README.md`, `agent/collectors/server.mjs`, `layers/ipmgt/server/plugins/ipamScanner.ts` | descriptions/comments referencing the network/server split, Zabbix/PRTG framing, `/api/net`, `/api/server`, `NUXT_NET_*`, `NUXT_SERVER_*` |

## 3. Database objects scheduled for archival

The legacy tables lived in the `public` schema and were created lazily at boot
(the bootstrap DDL is now deleted, so **fresh installs never create them**).
For existing databases, migration `0001_archive_legacy.sql` in
`layers/monitoring/migrations/` moves every legacy object that exists into the
`monitoring_legacy_archive` schema (and the final drop is a documented,
operator-initiated step — see the migration header). Objects covered:

- 15 `net_*` tables, 20 `server_*` tables (inventory §3.1–3.2)
- 3 hypertables: `net_metrics`, `net_sensor_readings`, `server_item_history`
- 6 named indexes (move with their tables)

No shared portal/Docker/IPAM object is touched.

## 4. Environment variables removed

`NUXT_NET_POLLING_ENABLED`, `NUXT_NET_POLL_INTERVAL_SECONDS`,
`NUXT_NET_POLL_CONCURRENCY`, `NUXT_NET_SNMP_COMMUNITY`, `NUXT_NET_SNMP_VERSION`,
`NUXT_NET_SNMP_TIMEOUT_MS`, `NUXT_NET_PING_TIMEOUT_SECONDS`,
`NUXT_NET_DISCOVERY_CONCURRENCY`, `NUXT_SERVER_POLLING_ENABLED`,
`NUXT_SERVER_POLL_INTERVAL_SECONDS`, `NUXT_SERVER_POLL_CONCURRENCY`,
`NUXT_SERVER_SNMP_COMMUNITY`, `NUXT_SERVER_SNMP_VERSION`,
`NUXT_SERVER_SNMP_TIMEOUT_MS`, `NUXT_SERVER_PING_TIMEOUT_SECONDS`,
`NUXT_SERVER_DISCOVERY_CONCURRENCY`, `NUXT_SERVER_WEB_TIMEOUT_MS`,
`NUXT_SERVER_TRAP_ENABLED`, `NUXT_SERVER_TRAP_PORT`,
`NUXT_SERVER_TRAP_BIND_ADDRESS`.

Replacements are documented in `nuxt.config.ts` (`runtimeConfig.monitoring`,
`NUXT_MONITORING_*`).

## 5. Dependencies

None removed — `net-snmp`, `ping`, `chart.js`, `vue-chartjs`, `exceljs` are all
shared with other modules or reused by the new engine (inventory §6).

## 6. Zabbix-derived concept audit

Verified removed from all active code, schema, UI text, API surface and docs
(no renamed survivors): hosts-separate-from-devices, items, item keys,
templates, template items, template-linked hosts, triggers, trigger
expressions, problems, Zabbix-style actions, web scenarios, Zabbix severities,
Zabbix import/export formats, Zabbix agent terminology, problem-event
lifecycle, and every "Zabbix engine/clone" comment.

## 7. Verification

Repo-wide sweep (2026-07-16) for
`zabbix|prtg|net_<table>|server_<table>|NUXT_NET_|NUXT_SERVER_|/api/net/|/api/server/`
across `*.ts, *.vue, *.mjs, *.md, *.yml, *.json, *.sh` returned matches **only** in:

1. `docs/monitoring/legacy-monitoring-inventory.md` — historical backup
   documentation (permitted).
2. `release-notes/*.md` — historical release notes (permitted; they describe
   past releases and must not be rewritten).

Justification for each retained reference is recorded in the cleanup JSON.

## 8. Preserved shared components (untouched or reference-only edits)

Portal auth (local/LDAP/OIDC), `appAccess` middleware (route table updated
only), audit log, alert channels, secret crypto, module logs, app launcher,
theme, Docker layer, IP Management layer, Docker-platform hypertables,
`users/app_settings/audit/...` portal tables.
