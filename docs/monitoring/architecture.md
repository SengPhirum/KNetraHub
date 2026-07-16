# KNetraHub Monitoring — Architecture

LibreNMS-equivalent monitoring platform built as an isolated Nuxt layer
(`layers/monitoring/`) with a dedicated PostgreSQL schema (`monitoring`).
Clean-room design; parity targets recorded in
[`librenms-upstream-parity-snapshot.md`](./librenms-upstream-parity-snapshot.md),
status tracked in [`librenms-feature-parity.md`](./librenms-feature-parity.md).

## 1. Principles

1. **One unified device model.** Routers, switches, firewalls, servers,
   hypervisors, printers, wireless controllers, storage, UPS and environmental
   systems are all rows in `monitoring.devices` with *discovered capabilities*.
   There is no host/device split and no Zabbix-style item/trigger/template
   model anywhere.
2. **Discovery defines, polling collects.** Modular discovery enumerates
   entities (ports, sensors, processors, …) and reconciles them against the DB
   with stable identity keys; modular polling then collects *every* discovered
   entity — never just a primary interface or first sensor.
3. **No silent data loss.** Every poll starts from a persisted collection
   plan; every planned item ends in a recorded final state (persisted /
   confirmed-unsupported / skipped-with-reason / failed-with-error). Runs with
   unexplained missing items are marked incomplete.
4. **Registry-driven.** OS definitions, discovery modules, poller modules,
   sensor definitions, service checks, trap handlers and alert transports are
   registered declaratively — no vendor `if/else` chains.
5. **Durable scheduling.** Work is a row in `monitoring.jobs` claimed with
   `FOR UPDATE SKIP LOCKED` leases by registered poller nodes — retries,
   backoff, dead-letter, heartbeat, stale-lease recovery. Never a
   fire-and-forget `setInterval` poll loop.
6. **Real data only.** Nothing is simulated at runtime; demo/simulated data is
   confined to `layers/monitoring/tests/`.

## 2. Domain map → code layout

```text
layers/monitoring/
├── nuxt.config.ts                  layer registration
├── app/
│   ├── components/mon/             shared UI (status badges, metric charts, tables)
│   ├── composables/                useMonitoringApi (fetch + pagination helpers)
│   └── pages/monitoring/           all UI routes (see §8)
├── server/
│   ├── api/monitoring/v1/          versioned REST API (see §7)
│   ├── db/                         schema migrations (TS-embedded SQL) + runner + query helpers
│   ├── snmp/                       SNMP engine (net-snmp wrapper): v1/v2c/v3, get/walk/bulk/table
│   ├── core/                       registries, counter math, reconciliation, availability,
│   │                               collection-plan builder, events
│   ├── definitions/                OS definitions + sensor definition helpers (declarative)
│   ├── discovery/                  discovery engine + modules/
│   ├── polling/                    polling engine + modules/
│   ├── alerting/                   rule evaluation, incident lifecycle, templates, transports/
│   ├── services/                   active service checks (icmp/tcp/http/dns/cert/...)
│   ├── receivers/                  SNMP trap receiver, syslog receiver
│   ├── jobs/                       queue, dispatcher, worker pool, housekeeping
│   ├── plugins/                    Nitro bootstrap (migrate → register node → start)
│   └── utils/                      requireMonitoring RBAC guard, redaction, api helpers
├── shared/                         types + constants shared client/server
└── tests/                          vitest unit tests + fixtures (only place fake data exists)
```

Deviation from the recommended skeleton: migrations are TS-embedded SQL under
`server/db/migrations/` (ordered, recorded in `monitoring.schema_migrations`)
because Nitro bundles server code and cannot read loose `.sql` files at
runtime. They are repeatable, transactional, and forward-only.

## 3. Database (`monitoring` schema)

Groups (full DDL in `server/db/migrations/`):

| Group | Tables |
|---|---|
| Devices & admin | `devices`, `credential_profiles`, `locations`, `device_groups`, `device_group_members` (+dynamic rules on group), `device_module_settings`, `device_dependencies`, `maintenance_windows`, `maintenance_targets`, `device_availability`, `device_outages`, `settings` |
| Interfaces & addressing | `ports`, `port_counters` (counter baselines), `port_state_log`, `ipv4_addresses`, `ipv6_addresses`, `arp_entries`, `fdb_entries`, `vlans`, `port_vlans` |
| Routing/switching | `bgp_peers`, `ospf_instances`, `ospf_areas`, `ospf_neighbors`, `stp_instances`, `topology_links` (LLDP/CDP) |
| Hardware & health | `sensors`, `processors`, `mempools`, `storage`, `inventory` (entPhysical tree), `wireless_sensors` |
| Apps & services | `services`, `service_results` (hypertable), `applications`, `application_metrics` |
| Events/logs/alerts | `events`, `syslog` (hypertable), `traps`, `alert_rules`, `alert_rule_targets`, `alert_transports`, `alert_rule_transports`, `alert_templates`, `alerts` (incidents), `alert_log`, `alert_notifications` |
| Polling infra | `poller_nodes`, `jobs` (durable queue), `poll_runs`, `module_runs`, `collection_attempts` (hypertable), `schema_migrations` |
| Metrics | `port_metrics`, `sensor_metrics`, `metrics` (generic) — hypertables with compression, retention, and continuous aggregates (5m/1h/1d) |
| Billing & dashboards | `bills`, `bill_ports`, `bill_history`, `dashboards`, `dashboard_widgets` |

Security: SNMP communities / v3 passwords are AES-256-GCM encrypted via the
platform `secretCrypto` before storage and are **never** included in API
responses (`*_set` booleans instead; blank on update = keep).

## 4. Scheduling & execution

- `plugins/bootstrap.ts`: run migrations → archive legacy tables if present →
  register this node in `poller_nodes` → start dispatcher + N workers →
  optionally start trap/syslog receivers.
- **Dispatcher tick (every 5 s, cheap):** enqueue due jobs
  (`device.next_poll_at`, `next_discovery_at`, service intervals, alert-eval
  singleton, housekeeping daily) with `ON CONFLICT (dedupe_key) DO NOTHING`;
  reap expired leases (crash recovery); heartbeat.
- **Worker claim:** `UPDATE monitoring.jobs SET state='running', locked_by=$node,
  lease_until=now()+interval ... WHERE id IN (SELECT id … WHERE state='pending'
  AND run_at<=now() [AND poller_group matches] ORDER BY priority,run_at
  FOR UPDATE SKIP LOCKED LIMIT $n) RETURNING *`.
- Retries with exponential backoff; `dead` state after max attempts
  (dead-letter UI + replay); per-device serialization via dedupe keys.
- Multiple app instances (Docker Swarm replicas / separate poller deployments)
  cooperate through the same tables; devices pin to `poller_group`.

## 5. Collection pipeline (per poll job)

1. Build **collection plan** from device capabilities + enabled modules
   (precedence: device override > device-group > OS definition > global).
2. Execute modules; every SNMP request/table walk records an outcome row
   (`collection_attempts`): success / empty / no-such-object / timeout /
   auth-failure / parse-error / db-error / skipped(reason) / unsupported.
3. Counter math: 32/64-bit rollover, reboot (uptime regression) → baseline
   reset, speed-change handling, invalid-delta rejection — in `core/counters.ts`.
4. Persist metrics + entity state; emit `events` on state transitions;
   update `poll_runs`/`module_runs` roll-ups that power the Data Collection UI.
5. A run is **complete** only when every planned item has a final state.

Discovery reconciliation (in `core/reconcile.ts`): stable identity key per
entity → insert / update / unchanged / mark-stale; deletes only after N
consecutive confirmed-absent discoveries; a failed/truncated walk never
deletes previously known entities.

## 6. Alerting

`alert_rules` hold a structured JSON condition tree (`{ op: and|or,
conditions: [{entity, field, cmp, value}] }`) — no SQL from the UI. Evaluation
job (60 s): resolve rule scope (all / device groups / locations / devices) →
evaluate per entity → open/refresh/recover incidents in `alerts` with
transitions in `alert_log`. Lifecycle: open → acknowledged → recovered/closed,
with maintenance & dependency suppression, notify-delay, re-notify interval,
max count. Templates are safe `{{ path }}` interpolation only. Transports are
fetch-based plugins (webhook, Slack, Discord, Telegram, Teams, Mattermost,
Rocket.Chat, Gotify, ntfy, Pushover, PagerDuty, Opsgenie, SMTP email);
deliveries are recorded redacted in `alert_notifications`.

## 7. API

`/api/monitoring/v1/**` — session or API-token auth via the portal
(`appAccess` middleware = authentication boundary), tiers enforced per
endpoint with `requireMonitoring(event, tier)`:
viewer = read; operator = ack/notes/poll-now/discover-now/maintenance;
manager = full configuration. All list endpoints support
`page/per_page/sort/order/q` + column filters and return
`{ items, total, page, per_page }`. Errors use H3 `createError` consistently.
Secrets never serialize. OpenAPI description lives in `docs/monitoring/api.md`.

## 8. UI

Pages under `/monitoring` follow the LibreNMS menu structure (see
`app/composables/useNav.ts`): Overview, Devices (list/add/detail-tabs),
Device Groups, Locations, Discovery, Ports, Health (sensors), Processors,
Memory, Storage, Inventory, Wireless, Routing, Switching, Maps, Services,
Applications, Billing, Alerts (active/rules/transports/templates),
Maintenance, Logs (events/syslog/traps/alert log), Pollers, Data Collection
(coverage/failures), Settings. Device detail is a single tabbed page.
All pages use Nuxt UI + the portal theme.

## 9. Testing

Unit tests (vitest) for counter math, OID/index parsing, value conversion,
sensor scaling, rule evaluation, template rendering, syslog parsing, and
reconciliation. Integration/E2E strategy and current coverage are documented
in `docs/monitoring/testing.md`; anything not yet automated is listed as such
in the parity matrix — untested features are never marked Complete.
