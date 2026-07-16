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
| POST | `/devices` | admin | Add a device |
| GET | `/devices/:id` | viewer | Device detail + counts + availability + last poll |
| PUT | `/devices/:id` | admin | Update device config |
| DELETE | `/devices/:id` | admin | Remove a device |
| POST | `/devices/:id/poll` | operator | Queue an immediate poll |
| POST | `/devices/:id/discover` | operator | Queue immediate discovery |
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
| GET | `/pollers/jobs` | viewer | Recent/failed/dead jobs (filter: state) |
| POST | `/pollers/jobs/:id/replay` | operator | Requeue a dead-letter job |
| GET | `/data-quality/coverage` | viewer | Per-device collection completeness |
| GET | `/data-quality/failures` | viewer | Recent failed collection attempts |
| POST | `/discovery/scan` | operator | CIDR bulk-add + queue discovery |
| GET | `/metrics/query` | viewer | Time-series for a graph (`kind=port\|sensor\|metric`, `id`, `from`) |
| GET | `/system/status` | viewer | Dashboard summary counters |
| GET | `/maintenance` | viewer | Maintenance windows |
| GET | `/bills` | viewer | Traffic bills |

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
