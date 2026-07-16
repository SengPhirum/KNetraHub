# Legacy Monitoring Inventory

> Historical record. Captured 2026-07-16 before the LibreNMS-equivalent rebuild.
> Commit at capture time: `c135e432d815fb4d08a7622747c04d197530179e` (branch `main`, clean tree).
> Backup ref: branch `backup/legacy-monitoring-before-librenms-rebuild` and tag
> `legacy-monitoring-final` both point at this commit.

## 1. What the legacy module was

The legacy Monitoring module (`layers/monitoring/`, 173 files) was a merge of two
earlier apps:

- **Network** (`/monitoring/network/*`, `/api/net/*`) — PRTG-flavoured device
  monitoring: ICMP ping + SNMP v1/v2c system/interface/sensor collection, CIDR
  discovery, dashboards, reports, "AI insights", NetFlow/syslog placeholder pages.
- **Server** (`/monitoring/server/*`, `/api/server/*`) — an explicit **Zabbix
  clone**: hosts, items, item keys, templates, template items, template triggers,
  triggers, problems, actions, web scenarios, maintenance, severities and the
  Zabbix problem-event lifecycle.

Both shared one Nuxt layer, one `monitoring` app entitlement, one SSE stream
(`/api/sse/monitoring`), and four Nitro plugins (netPoller, serverPoller,
trapReceiver, alertHousekeeping) driven by in-process `setInterval` loops.

## 2. File inventory (all removed in the rebuild)

Complete listing at capture time: 173 files under `layers/monitoring/`.

### 2.1 Layer config
- `layers/monitoring/nuxt.config.ts`

### 2.2 Frontend pages (`layers/monitoring/app/pages/monitoring/`)
- Unified: `index.vue` (widget dashboard), `problems.vue`, `discovery.vue`,
  `maps.vue`, `groups.vue`, `settings.vue`, `logs.vue`
- Network: `network/index.vue`, `network/devices/index.vue`,
  `network/devices/[id].vue`, `network/sensors/index.vue`,
  `network/sensors/[id].vue`, `network/alerts.vue`, `network/syslog.vue`,
  `network/flows.vue`, `network/probes.vue`, `network/reports.vue`,
  `network/ai.vue`
- Server (Zabbix clone): `server/index.vue`, `server/hosts/index.vue`,
  `server/hosts/[id].vue`, `server/latestdata.vue`, `server/templates.vue`,
  `server/triggers.vue`, `server/problems.vue`, `server/actions.vue`,
  `server/maintenance.vue`, `server/services.vue`, `server/traps.vue`,
  `server/web/index.vue`, `server/web/[id].vue`

### 2.3 Frontend support
- Components: `NetSnmpFields.vue`, `net/DashboardWidget.vue`, 12 widgets under
  `net/widgets/` (TopTalkers, AvailabilityGraph, HostStatusSummary, LatencyGraph,
  DeviceAvailability, Syslog, TopProblems, StatusDoughnut, AlertsList, Sensors,
  ProblemsBySeverity, StatusSummary)
- Composables: `useNetData.ts`, `useMonitoringEvents.ts`
- Utils: `netCategories.ts`, `netDashboards.ts`, `netSnmp.ts`,
  `serverSeverity.ts`, `netDeviceTypes.ts`

### 2.4 Server plugins (background jobs)
- `server/plugins/netPoller.ts` — setInterval ICMP+SNMP poll of `net_devices`
- `server/plugins/serverPoller.ts` — setInterval Zabbix-style item collection,
  trigger evaluation into problems, action firing
- `server/plugins/trapReceiver.ts` — UDP SNMP trap listener → `server_traps`
- `server/plugins/alertHousekeeping.ts` — retention trimming

### 2.5 Server utils
`trapMonitor.ts`, `monitoringAuth.ts`, `netDashboards.ts`, `serverMonitor.ts`,
`serverProvision.ts`, `monitoringEvents.ts`, `importExport.ts`, `netMonitor.ts`

### 2.6 API routes
- SSE: `GET /api/sse/monitoring`
- `/api/net/*` (~50 handlers): devices CRUD/import/export, device group/monitoring/backups
  subroutes, sensors (+metrics/export), groups CRUD/import/export/members, dashboards CRUD,
  templates CRUD/import/export, alerts (+ack), alert rules, metrics, discovery (get/post),
  syslog, flows, probes, reports (get/post), ai
- `/api/server/*` (~60 handlers): hosts CRUD/import/export/monitoring, items
  CRUD/history, triggers CRUD, problems (+ack/close), templates CRUD/import/export
  + template items/triggers subroutes, hostgroups CRUD/import/export, actions CRUD,
  maintenance CRUD, services CRUD, web scenarios CRUD + steps, maps CRUD,
  discovery (get/post), traps

## 3. Database objects (public schema — no dedicated namespace)

Created imperatively at boot by `server/utils/db.ts` (`CREATE TABLE IF NOT
EXISTS` + `ALTER TABLE ADD COLUMN IF NOT EXISTS`, no migration framework) and
`server/utils/metrics.ts` (hypertables). Full DDL exported to
[`legacy-monitoring-schema.sql`](./legacy-monitoring-schema.sql).

### 3.1 Network-domain tables (15)
`net_devices`, `net_interfaces`, `net_sensors`, `net_alert_rules`, `net_alerts`,
`net_syslog`, `net_groups`, `net_device_groups`, `net_backups`, `net_flows`,
`net_probes`, `net_discovery_jobs`, `net_reports`, `net_dashboards`,
`net_device_templates`

### 3.2 Server-domain (Zabbix-model) tables (20)
`server_hosts`, `server_problems`, `server_host_groups`,
`server_host_group_members`, `server_host_interfaces`, `server_templates`,
`server_template_items`, `server_template_triggers`, `server_host_templates`,
`server_items`, `server_triggers`, `server_maintenance`, `server_actions`,
`server_services`, `server_maps`, `server_discovery_rules`,
`server_discovery_jobs`, `server_web_scenarios`, `server_web_steps`,
`server_traps`

### 3.3 TimescaleDB hypertables (3)
`net_metrics`, `net_sensor_readings`, `server_item_history`

### 3.4 Named indexes
`idx_net_alerts_timestamp`, `idx_net_alerts_device`, `idx_net_alerts_status`,
`idx_net_dashboards_owner`, `idx_server_problems_host_status`,
`idx_server_problems_trigger_status` (plus PK/unique indexes).

### 3.5 Security notes (defects the rebuild must not repeat)
- SNMP communities and SNMPv3 auth/priv passwords stored **in plaintext columns**
  on `net_devices` and `server_hosts` (the platform's `secretCrypto` AES-256-GCM
  helper existed but was not used here).
- No dedicated schema; monitoring tables mixed into `public` beside portal tables.
- No migration history — schema drift handled by ad-hoc `ALTER TABLE IF NOT EXISTS`.

## 4. Runtime configuration / environment variables (all removed)

From root `nuxt.config.ts` `runtimeConfig.net`:

| Env var | Default |
|---|---|
| `NUXT_NET_POLLING_ENABLED` | `true` |
| `NUXT_NET_POLL_INTERVAL_SECONDS` | `60` |
| `NUXT_NET_POLL_CONCURRENCY` | `16` |
| `NUXT_NET_SNMP_COMMUNITY` | `public` |
| `NUXT_NET_SNMP_VERSION` | `v2c` |
| `NUXT_NET_SNMP_TIMEOUT_MS` | `2000` |
| `NUXT_NET_PING_TIMEOUT_SECONDS` | `2` |
| `NUXT_NET_DISCOVERY_CONCURRENCY` | `64` |

From `runtimeConfig.server`:

| Env var | Default |
|---|---|
| `NUXT_SERVER_POLLING_ENABLED` | `true` |
| `NUXT_SERVER_POLL_INTERVAL_SECONDS` | `60` |
| `NUXT_SERVER_POLL_CONCURRENCY` | `16` |
| `NUXT_SERVER_SNMP_COMMUNITY` | `public` |
| `NUXT_SERVER_SNMP_VERSION` | `v2c` |
| `NUXT_SERVER_SNMP_TIMEOUT_MS` | `2000` |
| `NUXT_SERVER_PING_TIMEOUT_SECONDS` | `2` |
| `NUXT_SERVER_DISCOVERY_CONCURRENCY` | `64` |
| `NUXT_SERVER_WEB_TIMEOUT_MS` | `8000` |
| `NUXT_SERVER_TRAP_ENABLED` | `false` |
| `NUXT_SERVER_TRAP_PORT` | `1162` |
| `NUXT_SERVER_TRAP_BIND_ADDRESS` | `0.0.0.0` |

## 5. Portal integration points (updated, not deleted)

| Location | Legacy role |
|---|---|
| `app/utils/moduleRegistry.ts` | `monitoring` module entry ("network devices … and server hosts") |
| `app/utils/appRoutes.ts` | `/monitoring` route-prefix ownership |
| `app/composables/useNav.ts` | `MONITORING_GROUPS` sidebar (Problems, Sensors, Latest data, Devices, Hosts, NetFlow, Traps, Templates, Triggers, Web, …) |
| `app/middleware/legacy-monitoring.global.ts` | `/net/*`, `/server/*` → `/monitoring/*` redirects |
| `server/middleware/appAccess.ts` | maps `/api/net`, `/api/server`, `/api/sse/monitoring` → `monitoring` entitlement |
| `server/plugins/seedSubsystems.ts` | seeded `net_probes`, `net_alert_rules`, `server_host_groups`, `server_templates` + items/triggers |
| `scripts/seed.mjs` | demo fixtures into `net_devices/interfaces/sensors`, `server_hosts/problems` |
| `scripts/qa-fixtures.mjs`, `scripts/smart-qa.mjs` | QA fixtures/tests against `/api/net` + `/api/server` |
| `server/utils/db.ts` | legacy table DDL (lines 245–763) |
| `server/utils/metrics.ts` | `net_metrics`, `net_sensor_readings`, `server_item_history` hypertables |

## 6. Dependencies

| Package | Legacy use | Disposition |
|---|---|---|
| `net-snmp` | net/server pollers, trap receiver | **kept** — reused by the new SNMP engine |
| `ping` | net/server/ipmgt ICMP | **kept** — also used by IP Management |
| `chart.js` / `vue-chartjs` | graphs | **kept** — shared portal dependency |
| `exceljs` | report export | **kept** — shared portal dependency |

No dependency was exclusively owned by the legacy monitoring module, so none
were removed from `package.json`.

## 7. Zabbix-derived concepts present in the legacy model

Confirmed present and scheduled for removal (no renamed survivors permitted):
hosts-separate-from-devices, items, item keys (`key_` column), templates,
template items, template-linked hosts (`server_host_templates`), triggers,
trigger expressions, problems, Zabbix-style actions, web scenarios + steps,
Zabbix severities (`severity_num` 0–5), Zabbix import/export formats
(`importExport.ts`), problem-event lifecycle (`r_clock`, ack semantics),
"Zabbix clone" comments in `db.ts` / `nuxt.config.ts` / `moduleRegistry.ts`.

## 8. Shared platform capabilities the rebuild preserves

- Portal auth (`server/utils/auth.ts`, local/LDAP/OIDC), `requireApp` tiers
- Per-app access middleware (`server/middleware/appAccess.ts`)
- Audit log (`audit` table + `server/utils/store.ts` writers)
- Alert channels (`alert_channels`, telegram/teams/webhook, AES-GCM config)
- Secret crypto (`server/utils/secretCrypto.ts`, AES-256-GCM)
- Module logs (`server/utils/moduleLogs.ts` + `system_log`)
- App launcher/module registry, theme, Docker & IP Management modules
- Docker-platform hypertables (`node_metrics`, `container_metrics`,
  `disk_usage`, `network_usage`, `node_heartbeat`, `service_status_events`)
