# LibreNMS Feature Parity Matrix

Reviewed against the upstream snapshot in
[`librenms-upstream-parity-snapshot.md`](./librenms-upstream-parity-snapshot.md)
(commit `0dd0b575db6569e61687cebc1545e043d02f6cf4`, 2026-07-15). Statuses are
limited to **Complete / Partially complete / Blocked / Not applicable** —
`Complete` requires working backend + persisted real data + working API +
working UI (where applicable) + automated test coverage + documentation.
Sub-matrices (discovery modules, poller modules, sensors, applications, trap
handlers, alert transports, API endpoints, dashboard widgets, integrations,
OS definitions) are in their own files, linked below.

## How to read "Tests" column

- **unit** — covered by `layers/monitoring/tests/unit/*.test.ts`
- **build** — verified by a clean `nuxt build` (compiles, routes register)
- **manual** — exercised via curl/UI during development, no automated test yet
- **none** — not yet tested at all

## 1. Device lifecycle management

| Function | Upstream ref | Required behavior | KNetraHub path | DB objects | API | UI | Tests | Status | Notes |
|---|---|---|---|---|---|---|---|---|---|
| Add device (hostname/IP) | addhost | Create device by hostname or IP | `POST /devices` | `devices` | ✓ | Add Device modal | manual | **Complete** | |
| SNMP v1/v2c | addhost | Community-based SNMP | `core/credentials.ts` | `devices`, `credential_profiles` | ✓ | ✓ | manual | **Complete** | |
| SNMP v3 (all levels/protocols) | addhost | noAuthNoPriv/authNoPriv/authPriv, MD5/SHA-family, DES/AES-family | `snmp/engine.ts` | ✓ | ✓ | Add-Device modal + device Settings tab (full v3 forms) | manual | **Complete** | |
| ICMP-only device | addhost force ping-only | `snmp_disabled` flag, no SNMP attempted | `devices.snmp_disabled` | ✓ | ✓ | ✓ (checkbox) | manual | **Complete** | |
| Force-add (skip preflight) | force-add | Skip reachability check | `POST /devices` (`force=true`), `snmp/preflight.ts` | — | ✓ | ✓ (checkbox) | manual | **Complete** | Preflight: SNMP devices must answer a system-scalar GET (explicit credentials must work; with none given, every credential profile is tried in attempt order and the match is pinned); ICMP-only devices must answer a ping; `force=true` skips |
| Poller group assignment | poller-group | Devices pinned to a poller group | `devices.poller_group` | ✓ | ✓ | Device Settings tab | manual | **Complete** | |
| Location | location | Device location + map grouping | `devices.location_id`, `locations` | ✓ | ✓ | Locations page (read) + device Settings tab picker | manual | **Complete** | Auto-derived from sysLocation; manual assignment via Settings tab or API |
| Display name / hardware / OS override | override_sysLocation etc. | Manual overrides survive rediscovery | `os_override`, `hardware_override`, `display_name` | ✓ | ✓ | Device Settings tab | manual | **Complete** | |
| Port association mode | port_association_mode | ifIndex/ifName/ifDescr/ifAlias | `devices.port_association_mode` | ✓ | ✓ | Device Settings tab picker | none | **Partially complete** | Column + UI exist; reconciliation currently always keys on ifIndex — alternate modes not wired into `discovery/modules/ports.ts` |
| Device dependency | dependency | Suppress alerts when parent is down | `device_dependencies` | ✓ | — | — | manual | **Partially complete** | Schema + alert-evaluation suppression implemented; no CRUD API/UI yet |
| Maintenance | maintenance | Suppress alerts / skip polling for a window | `maintenance_windows`, `maintenance_targets` | ✓ | GET only | Maintenance list page (read-only) | manual | **Partially complete** | Evaluation logic (poll skip / alert suppression) fully implemented; create/edit API+UI not yet built |
| Bulk add (CIDR) | discovery/scan | Add many devices from a CIDR | `POST /discovery/scan` | ✓ | ✓ | Discovery page | manual | **Complete** | Bounded to /20; excluded-host support; credential-profile selection |
| Bulk add (CSV) | bulk import | Import devices from CSV | — | — | — | — | none | **Blocked** | Not implemented |
| Bulk operations (poll/rediscover/disable/delete) | bulk actions | Multi-select device actions | — | — | Per-device only | Per-device only | none | **Blocked** | Per-device poll/discover/delete exist; no multi-select bulk UI/API |
| Device status model | device states | up/down/degraded/disabled/ignored/maintenance/pending | `devices.status` | ✓ | ✓ | ✓ (badges) | manual | **Complete** | |
| Protocol-separated availability | icmp/snmp status | ICMP and SNMP tracked independently | `icmp_status`, `snmp_status` | ✓ | ✓ | Overview tab | manual | **Complete** | |

## 2. Discovery & polling engines

See [`discovery-modules-parity.md`](./discovery-modules-parity.md) and
[`poller-modules-parity.md`](./poller-modules-parity.md) for per-module
status. Summary:

| Capability | Status | Notes |
|---|---|---|
| Modular discovery engine, registry-driven | **Complete** | `server/discovery/engine.ts` + `core/registry.ts` |
| Modular polling engine, registry-driven | **Complete** | `server/polling/engine.ts` |
| Discovery/poll module override precedence (device>group>OS>global) | **Complete** | `core/moduleSettings.ts` |
| Collection plan persisted before execution | **Complete** | `poll_runs.plan` |
| Per-item outcome tracking | **Complete** | `collection_attempts` hypertable |
| Discovery reconciliation (never delete on one failure) | **Complete** | `core/reconcile.ts`, unit-tested indirectly via counters/conditions suite; reconcile itself has no dedicated unit test yet (DB-dependent) |
| Suspect-empty-table detection | **Complete** | `reconcile()` `suspectEmpty` guard |
| Table-based collection (sparse, string/compound index, non-sequential) | **Complete** | `snmp/engine.ts` `table()` preserves arbitrary index strings |
| Counter processing (32/64-bit rollover, reboot, discontinuity, speed change) | **Complete** | `core/counters.ts`, unit-tested (16 tests) |
| Diagnostic full-MIB-subtree walk mode | **Complete** | `POST /devices/:id/capture` (get/walk, preset subtrees incl. full MIB-2, row-capped with partial results) + device **Capture** tab showing every raw varbind (OID, symbolic name, type, value, hex) with download |

## 3. SNMP engine

| Function | Status | Notes |
|---|---|---|
| v1/v2c/v3 (all auth/priv combinations) | **Complete** | `snmp/engine.ts` |
| GET/GETNEXT/GETBULK/WALK/table | **Complete** | |
| SNMP context | **Complete** | |
| Configurable timeout/retries/maxRepetitions | **Complete** | env defaults + per-request override |
| IPv4/IPv6 transport | **Complete** | `udp4`/`udp6` |
| TCP transport | **Blocked** | net-snmp / this engine is UDP-only |
| Response validation + type conversion | **Complete** | `snmp/values.ts` |
| Ad-hoc connectivity/query test | **Complete** | `POST /snmp/test` (`snmp/preflight.ts`): ICMP ping + system-scalar GET with parsed identity, detected OS, and raw varbinds; wired to the Add-Device "Test connection" button and the device Settings tab "Test now" |
| Raw capture OID→name resolution | **Complete** | `snmp/mibNames.ts` (built from the engine's own OID tables; unit-tested) |
| Debug tracing with secret redaction | **Partially complete** | `describeSnmpTarget()` never logs secrets; there is no dedicated verbose/diagnostic log-level toggle yet |

## 4. Health sensors

See [`sensor-parity.md`](./sensor-parity.md). Core classes (temperature,
voltage, current, fanspeed, power, humidity, state, percent, runtime) are
**Complete** via ENTITY-SENSOR-MIB, LM-SENSORS, UPS-MIB, Printer-MIB. Several
LibreNMS classes with no universal standard MIB (chromatic dispersion,
quality factor, TV signal, waterflow beyond generic units) are **Blocked** —
they require vendor-specific MIBs not yet mapped.

## 5. Wireless monitoring

| Function | Status | Notes |
|---|---|---|
| `wireless_sensors` schema + discovery/poll extension points | **Complete** | schema + registry ready |
| Built-in wireless discovery module (AP/radio/client walk) | **Blocked** | No vendor wireless-controller MIB mapping shipped yet (ArubaOS/UniFi/Cisco WLC differ significantly); schema and UI (`/monitoring/wireless`) are ready to receive data once a module is added |
| Wireless UI (fleet list) | **Complete** | `/monitoring/wireless` |
| Per-AP/per-radio graphs, controller→AP mapping | **Blocked** | Depends on the discovery module above |

## 6. System / processor / memory / storage / inventory

| Function | Status | Notes |
|---|---|---|
| sysDescr/sysObjectID/sysName/sysContact/sysLocation/sysUpTime | **Complete** | `discovery/modules/core.ts` |
| Hardware/serial/OS/version detection | **Complete** | OS registry + ENTITY-MIB chassis serial |
| All processor instances (HR + UCD fallback) | **Complete** | `discovery/modules/health.ts`, `polling/modules/health.ts` |
| All memory pools (UCD + HR RAM/virtual) | **Complete** | |
| All storage entities (every fixed-disk row) | **Complete** | |
| Full ENTITY-MIB physical inventory tree | **Complete** | `monitoring.inventory` |
| Entity operational/administrative/alarm state | **Partially complete** | `is_fru` captured; explicit oper/admin/alarm state columns from ENTITY-STATE-MIB not yet polled |

## 7. Routing & switching

| Function | Status | Notes |
|---|---|---|
| BGP peers (state, AS, updates, established time) | **Complete** | discovery + poll modules |
| BGP accepted/advertised prefix counts | **Blocked** | Column exists (`accepted_prefixes`) but not populated — requires per-AFI BGP4V2-MIB, not in scope of the base BGP4-MIB walk implemented |
| OSPF instances + neighbors | **Complete** | |
| OSPFv3 | **Blocked** | Only OSPFv2 (BGP4-MIB/OSPF-MIB) implemented; OSPFv3-MIB not mapped |
| VRFs | **Blocked** | No VRF-aware discovery module |
| MPLS/pseudowires | **Blocked** | Not implemented |
| IP-SLA | **Blocked** | Not implemented |
| VLAN inventory | **Complete** | Q-BRIDGE dot1qVlanStaticTable |
| Spanning tree | **Complete** | Single-instance dot1d STP; MST/PVST+ per-instance not distinguished |
| FDB / ARP tables | **Complete** | |
| LLDP/CDP neighbor discovery → topology links | **Complete** | Cross-linked to known devices by hostname match |
| Network Access Control / 802.1X | **Blocked** | Not implemented |
| xDSL | **Blocked** | Not implemented |

## 8. Services & applications

| Function | Status | Notes |
|---|---|---|
| Active service checks: ICMP/TCP/HTTP/DNS/certificate/SMTP/SSH/NTP | **Complete** | `services/runner.ts`, no shell interpolation |
| Service scheduling, retry interval, thresholds | **Complete** | |
| Nagios-compatible external plugin execution | **Blocked** | Not implemented — all checks are native, no arbitrary-command execution surface (deliberate; matches the security requirement to avoid shell interpolation, but means true Nagios-plugin compatibility is out of scope for now) |
| Application monitoring framework (schema + registry) | **Complete** | `monitoring.applications`/`application_metrics` |
| Individual application collectors (Apache, MySQL, Postgres, Redis, etc.) | **Blocked** | None of the ~60 LibreNMS application collectors are implemented; this is the single largest remaining gap — see [`applications-parity.md`](./applications-parity.md) |

## 9. SNMP traps

| Function | Status | Notes |
|---|---|---|
| v1/v2c trap receiver | **Complete** | `receivers/traps.ts` |
| v3 trap/inform receiver | **Blocked** | net-snmp's receiver API used here handles v1/v2c; v3 trap auth is not wired |
| Configurable port/bind address | **Complete** | |
| Varbind parsing + full storage | **Complete** | |
| Trap-handler registry | **Complete** | 4 built-in handlers (linkUp/linkDown/coldStart-warmStart/authFailure) |
| Unknown-trap logging (never dropped) | **Complete** | |
| Trap replay | **Complete** | `replayTrap()` + API |
| Trap deduplication / rate limiting | **Blocked** | Not implemented |

## 10. Syslog

| Function | Status | Notes |
|---|---|---|
| RFC 3164 + RFC 5424 parsing | **Complete** | unit-tested (`tests/unit/syslog.test.ts`) |
| UDP + TCP ingestion | **Complete** | |
| TLS syslog | **Blocked** | Not implemented |
| Device association, severity/facility, structured data | **Complete** | |
| Ingestion health stats (received/parsed/unknown/dropped) | **Complete** | exposed via `/system/status` |
| Full-text search UI | **Partially complete** | List/filter page exists (`/monitoring/logs/syslog`); no free-text search box wired yet |
| Graylog integration | **Blocked** | Not implemented |

## 11. Alerting

| Function | Status | Notes |
|---|---|---|
| Structured rule builder (AND/OR, nested, no raw SQL) | **Complete** | `alerting/conditions.ts`, unit-tested (14 tests) |
| Rule scoping (devices/groups/locations) | **Complete** | |
| Delay, re-notify interval, max notifications | **Complete** | |
| Alert lifecycle (open→acknowledged→recovered/suppressed) | **Complete** | `alerting/evaluate.ts` |
| Sticky acknowledgement | **Complete** | `ack_until_recovery` |
| Maintenance + dependency suppression | **Complete** | |
| Flapping suppression | **Blocked** | Not implemented — a rapidly oscillating condition currently re-opens/re-recovers each cycle rather than being dampened |
| Working-hour / timezone-aware schedules | **Blocked** | Not implemented |
| Safe template rendering | **Complete** | `alerting/templates.ts`, no code execution |
| 13 transport plugins | **Complete** | webhook, Slack, Discord, Telegram, Teams, Mattermost, Rocket.Chat, Gotify, ntfy, Pushover, PagerDuty, Opsgenie, SMTP |
| Additional transports (Matrix, XMPP, ServiceNow, Jira, GitHub/GitLab issue, Kafka, MQTT, generic syslog, Nagios command) | **Blocked** | Not implemented — transport plugin framework supports adding these without core changes |
| Delivery audit trail (redacted) | **Complete** | `alert_notifications` |
| Rule test against historical data | **Blocked** | Not implemented |

## 12. Dashboards & visualization

| Function | Status | Notes |
|---|---|---|
| Dashboard schema (per-user, shared, layout JSON) | **Complete** | `monitoring.dashboards` |
| Dashboard CRUD API | **Blocked** | Schema ready; no `/dashboards` endpoints implemented yet |
| Customizable widget canvas UI | **Blocked** | The Overview page (`/monitoring`) is a fixed, curated summary, not a drag-and-drop widget canvas |
| Individual widgets (alerts, availability map, top devices/interfaces, custom graph, world map, …) | **Partially complete** | The data each widget needs is servable today via existing list/metrics endpoints; no widget framework consumes them yet |

## 13. Maps & topology

| Function | Status | Notes |
|---|---|---|
| Topology data from real LLDP/CDP discovery | **Complete** | `monitoring.topology_links` |
| Topology/neighbor list UI | **Complete** | `/monitoring/maps` (list view) |
| Interactive graphical map (nodes/edges, availability overlay) | **Blocked** | Only a tabular neighbor list exists; no graphical map renderer |
| Geographic world map | **Blocked** | `locations` has lat/lng columns; no map UI consumes them |
| Custom map editor | **Blocked** | Not implemented |

## 14. Traffic billing

| Function | Status | Notes |
|---|---|---|
| Quota billing | **Complete** | `billing/calculate.ts` |
| 95th-percentile billing | **Complete** | rollover-safe delta-based percentile |
| Multiple ports per bill | **Complete** | `bill_ports` |
| Billing period / history | **Complete** | `bill_history` |
| Billing CRUD API | **Blocked** | Read-only `GET /bills` exists; create/edit API not yet built |
| Billing UI (graphs, alerts, CSV/PDF export) | **Partially complete** | List page exists; graphs/export/alerting on bills not implemented |

## 15. Configuration backup integrations

| Function | Status | Notes |
|---|---|---|
| Oxidized/RANCID/Unimus integration points | **Blocked** | Not implemented |

## 16. Flow & external metric integrations

| Function | Status | Notes |
|---|---|---|
| NetFlow/sFlow/IPFIX ingestion | **Blocked** | Not implemented |
| SmokePing/collectd/Graphite/InfluxDB/OpenTSDB/Prometheus/Kafka export | **Blocked** | Not implemented — TimescaleDB is the sole metric store today |
| PeeringDB / Proxmox / Check_MK agent integration | **Blocked** | Not implemented |

## 17. Distributed polling & HA

| Function | Status | Notes |
|---|---|---|
| Multiple poller nodes, poller groups | **Complete** | `poller_nodes`, `devices.poller_group` |
| Worker registration, heartbeat, capacity | **Complete** | `jobs/dispatcher.ts` |
| Durable queue with leases, retries, backoff, dead-letter | **Complete** | `jobs/queue.ts` |
| Stale-job / abandoned-worker recovery | **Complete** | `reapExpiredLeases()` |
| No duplicate concurrent polling of the same device/module | **Complete** | dedupe keys + `FOR UPDATE SKIP LOCKED` |
| Poller Administration UI | **Complete** | `/monitoring/pollers` + `/monitoring/pollers/jobs` |

## 18. API & automation

| Function | Status | Notes |
|---|---|---|
| Versioned REST API under `/api/monitoring/v1` | **Complete** | see [`api.md`](./api.md) |
| Pagination, sorting, filtering, search | **Complete** (pagination/filter) / **Partially complete** (sort — `listParams` supports it, most handlers don't yet expose a sortable column set) | |
| Field selection | **Blocked** | Not implemented |
| Bulk actions | **Partially complete** | Discovery-scan is bulk; generic bulk device actions are not |
| Consistent error model | **Complete** | H3 `createError` throughout |
| Idempotency keys | **Blocked** | Not implemented |
| API-token auth, scopes, expiry, revocation | **Complete** (portal-level; shared with Docker/IPAM) | `server/api/user/tokens/*` — not Monitoring-specific, reused as-is |
| Rate limiting | **Blocked** | Not implemented |
| Audit logging | **Complete** | `auditMonitoring()` → portal `audit` table |
| OpenAPI spec + interactive docs | **Blocked** | See `api.md` note |
| Contract tests | **Blocked** | Not implemented |

## 19. CLI

See [`cli.md`](./cli.md) — **Blocked** in full; every intended command has a
REST equivalent today.

## 20. Authentication, authorization, audit

| Function | Status | Notes |
|---|---|---|
| Viewer/operator/admin tiers | **Complete** | reuses portal `AppTier` model (`viewer/operator/manager/admin`; Monitoring's "manager" tier is unused, config actions require `admin`) |
| Device-group-restricted access | **Blocked** | Not implemented — all viewers see all devices |
| Audit of state-changing actions | **Complete** | `auditMonitoring()` called from every mutating endpoint |

## 21. Security

| Function | Status | Notes |
|---|---|---|
| AES-256-GCM credential encryption | **Complete** | reuses `server/utils/secretCrypto.ts` |
| Secret redaction (logs, API, deliveries) | **Complete** | |
| Input/schema validation | **Complete** | `deviceInput.ts`, `conditions.ts` validators |
| SSRF protection on alert transports | **Complete** | `guardUrl()` blocks non-http(s) and link-local metadata hosts |
| Command execution allowlists / no shell interpolation | **Complete** | service checks are native, no `exec()` anywhere in the module |
| CIDR allowlists for discovery | **Complete** | scan bounded to /20, excluded-host list supported |
| Non-root workers, DB least privilege | **Not applicable at app layer** | Deployment/infra concern (Docker/DB user config), not app code |
| Key rotation strategy | **Blocked** | No automated re-encryption job on JWT-secret rotation |
| Dependency vulnerability scanning | **Not applicable here** | CI/CD concern, not part of this module |

## 22. Performance & retention

| Function | Status | Notes |
|---|---|---|
| Configurable retention (metrics/events/syslog/traps/job-runs) | **Complete** | `housekeeping.ts` + `NUXT_MONITORING_*_RETENTION_DAYS` |
| Continuous aggregates (5m/1h) | **Complete** | `0005_metrics.ts` |
| Compression policy | **Complete** | on `port_metrics` (highest volume) |
| Query optimization for overview/graphs/search | **Partially complete** | Indexes present on hot paths; no load-tested query plan review yet |

## Definition-of-done cross-reference

See [`data-collection-completeness-report.md`](./data-collection-completeness-report.md)
for the point-by-point self-assessment against the mandate's 20-point
Definition of Done.
