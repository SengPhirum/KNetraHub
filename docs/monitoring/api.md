# Monitoring API Guide

Base path: `/api/monitoring/v1`. Authentication is the portal session cookie
or an API token (`server/utils/auth.ts`); every route requires at least the
Monitoring **viewer** tier (`server/middleware/appAccess.ts` is the
authentication boundary; handlers additionally call
`requireMonitoring(event, tier)` for write/admin actions).

## Tiers

| Tier | Grants |
|---|---|
| viewer | read everything: devices, ports, health, alerts, logs, pollers, data-quality |
| operator | + acknowledge alerts, poll/discover now, discovery scan, test transports, replay dead-letter jobs |
| admin | + device/credential-profile CRUD, alert rule/transport/template CRUD, settings |

## Conventions

- List endpoints accept `page`, `per_page` (default 50, max 500), and return
  `{ items, total, page, per_page }`.
- Errors use the standard H3 error shape (`{ statusCode, statusMessage }`).
- No credential/secret field is ever present in a response; presence is
  exposed as `<field>_set: boolean`.
- Timestamps are ISO-8601 UTC.

## Endpoint index

| Method | Path | Tier | Purpose |
|---|---|---|---|
| GET | `/devices` | viewer | List devices (filter: status, os, location_id, poller_group, group_id, q) |
| POST | `/devices` | admin | Add a device — reachability preflight first (explicit credentials must answer a system-scalar GET; with none given every credential profile is tried in attempt order and the match is pinned; ICMP-only devices must answer a ping); `force=true` skips the preflight |
| DELETE | `/devices` | admin | Bulk delete (`{ ids: [] }`) |
| GET | `/devices/:id` | viewer | Device detail + counts + availability + last poll |
| PUT | `/devices/:id` | admin | Update device config |
| DELETE | `/devices/:id` | admin | Remove a device |
| POST | `/devices/:id/poll` | operator | Queue an immediate poll |
| POST | `/devices/:id/discover` | operator | Queue immediate discovery |
| POST | `/devices/:id/capture` | operator | Diagnostic raw SNMP capture: `{op:'walk', oid|preset, max_rows?}` or `{op:'get', oids:[]}` → every varbind (numeric OID, symbolic name, type, value, hex), row-capped, partial results marked `truncated`; nothing persisted |
| POST | `/snmp/test` | operator / admin | Connectivity + query test, nothing persisted: `{device_id}` (operator, stored credentials) or inline `{hostname, snmp_version, snmp_community|v3_*, snmp_port?, snmp_context?, credential_profile_id?}` (admin) → ICMP result + SNMP system scalars (parsed + raw varbinds + detected OS) |
| GET | `/credential-profiles` | viewer | List SNMP credential profiles (secrets as `*_set` booleans) |
| POST | `/credential-profiles` | admin | Create a credential profile |
| PUT | `/credential-profiles/:id` | admin | Update a profile (blank secret keeps current) |
| DELETE | `/credential-profiles/:id` | admin | Delete a profile (referencing devices fall back to per-device credentials) |
| GET | `/devices/:id/{ports,sensors,processors,mempools,storage,inventory,events,alerts}` | viewer | Device sub-resources |
| GET | `/ports` `/health` `/processors` `/memory` `/storage` `/inventory` `/wireless` | viewer | Fleet-wide entity lists |
| GET | `/routing/bgp` `/routing/ospf` | viewer | Routing state |
| GET | `/switching/vlans` `/switching/fdb` `/switching/arp` `/switching/neighbors` | viewer | Switching state / topology |
| GET | `/services` `/applications` | viewer | Service checks / application monitoring |
| GET | `/locations` `/device-groups` | viewer | Organization |
| GET | `/alerts` | viewer | Active/historical alerts (filter: state, severity, device_id) |
| POST | `/alerts/:id/ack` | operator | Acknowledge an alert |
| GET/POST | `/alerts/rules` | viewer / admin | Alert rules |
| GET/POST | `/alerts/transports` | viewer / admin | Notification transports |
| POST | `/alerts/transports/:id/test` | operator | Send a test notification |
| GET | `/alerts/templates` | viewer | Alert templates |
| GET | `/logs/events` `/logs/syslog` `/logs/traps` `/logs/alerts` | viewer | Log streams |
| GET | `/pollers` | viewer | Poller nodes + queue health |
| GET | `/pollers/jobs` | viewer | Recent/failed/dead jobs (filter: state, type; accurate total) |
| POST | `/pollers/jobs/:id/replay` | operator | Requeue a dead-letter job |
| GET | `/data-quality/coverage` | viewer | Per-device collection completeness |
| GET | `/data-quality/failures` | viewer | Recent failed collection attempts |
| POST | `/discovery/scan` | operator | CIDR bulk-add + queue discovery |
| GET | `/metrics/query` | viewer | Time-series for a graph (`kind=port\|sensor\|metric`, `id`, `from`; `kind=metric` also takes `metric` and optional `device_id` for device-level series like `icmp_rtt_ms` where `id=0`) |
| GET | `/system/status` | viewer | Dashboard summary counters |
| GET | `/maintenance` | viewer | Maintenance windows |
| GET | `/bills` | viewer | Traffic bills |
| POST | `/devices/bulk` | operator/admin | Multi-select actions: `{ids, action: poll\|discover\|enable\|disable\|ignore\|unignore\|delete}` (poll/discover = operator, rest = admin) |
| GET/PUT | `/devices/:id/dependencies` | viewer / admin | Parent devices (alert suppression); PUT `{parent_ids}` with cycle detection |
| PUT | `/ports/:id` | admin | Port flags: `{disabled?, ignored?}` |
| POST | `/locations`, PUT/DELETE `/locations/:id` | admin | Location CRUD |
| POST | `/device-groups`, GET/PUT/DELETE `/device-groups/:id` | admin (GET viewer) | Group CRUD; `rules` tree = dynamic membership (recomputed on save + daily), `device_ids` = static members |
| POST | `/maintenance`, GET/PUT/DELETE `/maintenance/:id` | operator (GET viewer) | Window CRUD with `targets` (device/group/location) and `recurrence` (daily/weekly/monthly) |
| PUT/DELETE | `/alerts/rules/:id` | admin | Rule update (incl. `transport_ids`) / delete |
| POST | `/alerts/templates`, PUT/DELETE `/alerts/templates/:id` | admin | Template CRUD (`is_default` is exclusive) |
| PUT/DELETE | `/alerts/transports/:id` | admin | Transport update (omit `config` to keep stored secrets) / delete |
| POST | `/services`, PUT/DELETE `/services/:id` | admin | Service-check CRUD (per-type param validation, no shell strings) |
| POST | `/bills`, GET/PUT/DELETE `/bills/:id` | admin (GET viewer) | Bill CRUD; `port_ids` replaces port set; GET includes ports + period history |
| GET/PUT | `/settings` | admin | DB-backed runtime settings (intervals, SNMP timeout/retries, retention) — override env without restart, effective ≤30s |
| GET/PUT | `/module-settings` | viewer / admin | Discovery/poll module registry + per-scope overrides `{changes:[{scope, scope_ref?, phase, module, enabled\|null}]}` |
| PUT | `/pollers/:id` | admin | Pause/resume a poller node (`{enabled}`) — paused nodes claim no jobs |
| DELETE | `/pollers/:id` | admin | Remove a stopped node's record (refused while heartbeating) |

## Example: add a device and watch it converge

```bash
curl -sX POST https://portal/api/monitoring/v1/devices \
  -H 'content-type: application/json' \
  -b "$COOKIE" \
  -d '{"hostname":"core-sw-01","ip":"10.0.0.1","snmp_version":"v2c","snmp_community":"public"}'
# → { "id": 42, "hostname": "core-sw-01", "queued_discovery": true }

curl -s https://portal/api/monitoring/v1/devices/42/ports -b "$COOKIE"
# once discovery completes: every discovered interface, not just one
```

## Example: test SNMP before adding, then capture raw data

```bash
# Query test with inline credentials (nothing saved):
curl -sX POST https://portal/api/monitoring/v1/snmp/test -b "$COOKIE" \
  -H 'content-type: application/json' \
  -d '{"hostname":"10.0.0.1","snmp_version":"v2c","snmp_community":"public"}'
# → { host, icmp: {alive, rttMs}, snmp: { ok, system: {sysName, sysDescr, …},
#     detected: {os, text}, raw: [{oid, name, type, value}, …] } }

# Raw subtree walk against a saved device (LibreNMS "Capture" equivalent):
curl -sX POST https://portal/api/monitoring/v1/devices/42/capture -b "$COOKIE" \
  -H 'content-type: application/json' \
  -d '{"op":"walk","preset":"interfaces","max_rows":5000}'
# → { target, rows: [{oid, name:"IF-MIB::ifDescr.1", type, value, hex?}, …],
#     row_count, truncated, duration_ms }
```

## Example: graph a port

```bash
curl -s 'https://portal/api/monitoring/v1/metrics/query?kind=port&id=1201&from=-24h' -b "$COOKIE"
```

## OpenAPI

A machine-readable OpenAPI document is not yet generated for
`/api/monitoring/v1` (tracked as `Partially complete` in the parity matrix —
the portal's Docker API has one via `server/utils/openapi.ts`; extending that
generator to the Monitoring layer is the remaining work). Until then, this
document plus each handler's JSDoc header is the source of truth.
