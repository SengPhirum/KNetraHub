# Monitoring — Module Guides

Practical guides for extending each registry-driven surface. All registries
live in `layers/monitoring/server/core/registry.ts`; every module below is
registered via a side-effect import from its `index.ts`.

## Discovery-module guide

A discovery module enumerates entities for a device and reconciles them
against the database. To add one:

```ts
import { defineDiscoveryModule } from '../../core/registry'
import { reconcile } from '../../core/reconcile'

defineDiscoveryModule({
  name: 'my-module',
  order: 45,               // execution order within the run
  defaultEnabled: true,
  requiresSnmp: true,      // skip on ICMP-only devices
  async run(ctx) {
    const { db, device, snmp, record } = ctx
    const res = await snmp!.walk('1.3.6.1.4.1.X.Y')
    if (!res.ok) {
      record('my-oid-walk', res.outcome, res.error, res.durationMs)
      return { status: res.outcome === 'unsupported' ? 'unsupported' : 'failed', error: res.error }
    }
    record('my-oid-walk', 'success', `${res.value.length} rows`, res.durationMs)

    const found = res.value.map((row) => ({ /* identity + update columns */ }))
    const rec = await reconcile({
      db, table: 'monitoring.my_table', deviceId: device.id,
      identityColumns: ['some_key'], updateColumns: ['col_a', 'col_b'], found
    })
    return { status: found.length ? 'success' : 'empty' }
  }
})
```

Rules:
- **Always call `ctx.record(item, outcome, ...)` for every SNMP request** —
  this is the no-silent-loss audit trail. Never let an item disappear
  without a recorded outcome.
- **Never delete** rows directly; call `reconcile()`, which marks missing
  rows stale and only they get purged by housekeeping after
  `STALE_MISS_THRESHOLD` (3) consecutive confirmed-absent discoveries.
- Register the module in `discovery/modules/index.ts`.
- Add a row to `docs/monitoring/librenms-feature-parity.md` (discovery
  matrix) recording status and evidence.

## Poller-module guide

Same shape as discovery, registered with `definePollerModule`, executed
every poll cycle (default 5 min). Poller modules refresh **already
discovered** entities — never invent new rows (that's discovery's job).
Use `ctx.intervalSec` and `(device as any)._rebooted` (set by the `system`
module) when computing counter deltas — see
`server/polling/modules/ports.ts` for the reference implementation using
`core/counters.ts`.

## Device-onboarding guide

1. **Add Device** (UI or `POST /api/monitoring/v1/devices`) with hostname/IP
   and either a `credential_profile_id` or inline SNMP fields, or
   `snmp_disabled: true` for ICMP-only.
2. Discovery is queued immediately; full module discovery runs and detects
   OS, ports, sensors, inventory, etc.
3. The device polls on the default 5-minute cycle from then on
   (`next_poll_at` is set at discovery completion).
4. Bulk-add: `POST /api/monitoring/v1/discovery/scan` with a CIDR (≤ /20).

## SNMPv3 guide

Configure per device or via a reusable **credential profile**
(`POST /api/monitoring/v1/credential-profiles` — see `0002_core.ts` for the
column set). Supported: `noAuthNoPriv` / `authNoPriv` / `authPriv`;
auth protocols `md5, sha, sha224, sha256, sha384, sha512`; priv protocols
`des, aes, aes256b, aes256r`. All secret columns are AES-256-GCM encrypted by
`server/utils/secretCrypto.ts` before storage and are never included in API
responses — list/detail endpoints return `*_set: boolean` instead.

## Credential-security guide

- Secrets are encrypted at rest (`secretCrypto`, key derived from
  `NUXT_JWT_SECRET`); rotate the JWT secret to rotate the derivation key
  (existing ciphertext must be re-encrypted in that case — there is no
  automatic re-encryption job yet).
- Secrets are decrypted only inside `core/credentials.ts`, immediately before
  constructing an `SnmpClient`, and are never logged
  (`snmp/engine.ts`'s `describeSnmpTarget()` never includes them).
- Alert-transport configs follow the same pattern (`alerting/transports.ts`).

## OS-definition guide

`server/definitions/os/index.ts` — call `defineOs({...})` with
`sysObjectIdPrefixes` and/or `sysDescrPatterns`; `detectOs()` scores matches
and picks the best one (longer/more specific prefix wins). `disabledModules`
lets an OS opt out of modules that never apply (e.g. BGP/OSPF on a printer).

## Sensor-definition guide

Sensors are discovered from standard MIBs (ENTITY-SENSOR, LM-SENSORS,
UPS-MIB, Printer-MIB) in `discovery/modules/health.ts`; each becomes a row
in `monitoring.sensors` with `divisor`/`multiplier` for scaling and optional
`state_translations` (JSON map of raw value → `{label, severity}`) for
enum-valued sensors like UPS battery status.

## Application-plugin guide

Not yet implemented — see `docs/monitoring/librenms-feature-parity.md`
(Applications matrix) for the full target list and current status
(`Blocked`). The extension point is `monitoring.applications` +
`monitoring.application_metrics`; a collector would be a poller-module-style
function keyed by `app_type` reading agent output/command results and
persisting to `application_metrics`.

## Trap-handler guide

```ts
defineTrapHandler({
  name: 'myVendorTrap',
  match: ['1.3.6.1.4.1.X.Y.0'],   // exact OID, or a '.'-terminated prefix
  async handle(ctx) {
    // ctx.db, ctx.deviceId, ctx.sourceIp, ctx.trapOid, ctx.varbinds
    return { message: '...', eventType: 'my_event', severity: 'warning' }
  }
})
```
Register in `receivers/traps.ts`. Unknown traps are still stored (raw
varbinds) and logged as an event unless `monitoring.settings['traps.unknown']
= 'ignore'`. Traps can be replayed via `replayTrap()` / the Jobs-adjacent
trap UI action.

## Alert-rule guide

Conditions are a structured JSON tree (never SQL) — see
`server/alerting/conditions.ts` for the grammar and
`server/alerting/defaults.ts` for worked examples. Validate with
`validateConditions()` before saving.

## Alert-template guide

`{{ path.to.value }}` interpolation only (`server/alerting/templates.ts`).
Available roots: `alert`, `rule`, `device`, `faulting`, `now`, `portal_url`.
Secret-looking field names (`*password*`, `*secret*`, `*token*`,
`*community*`) are always blocked from interpolation.

## Alert-transport guide

Implement `TransportFn` in `server/alerting/transports.ts` and add it to the
`TRANSPORTS` map, keyed by a `TransportType` (add to
`shared/constants.ts` first). All transports go through the shared
`post()`/SSRF-guarded fetch helper except SMTP, which uses a minimal raw
socket client.

## Distributed-poller guide

Every app instance that has `NUXT_MONITORING_DISPATCHER_ENABLED` (default
true) registers itself in `monitoring.poller_nodes` and both schedules and
claims jobs from the shared `monitoring.jobs` queue
(`server/jobs/dispatcher.ts`, `server/jobs/queue.ts`). Assign devices to a
`poller_group` (integer) to pin them to a subset of nodes; set
`NUXT_MONITORING_POLLER_GROUP` per deployment. No extra infrastructure
(Redis, separate queue service) is required — the queue lives in Postgres
and uses `FOR UPDATE SKIP LOCKED` leases.

## Data-retention guide

Retention is trimmed daily by `server/jobs/housekeeping.ts` using the
`NUXT_MONITORING_*_RETENTION_DAYS` env vars (metrics, events, syslog, traps,
job-run detail). TimescaleDB continuous-aggregate policies additionally keep
long-range graph queries fast without scanning raw samples.

## API guide

See [`api.md`](./api.md).

## CLI guide

See [`cli.md`](./cli.md).

## Troubleshooting guide

See [`troubleshooting.md`](./troubleshooting.md).

## Data-collection-completeness guide

See the "No-silent-loss" design in
[`architecture.md`](./architecture.md#5-collection-pipeline-per-poll-job) and
the live Data Collection page (`/monitoring/data-collection`), backed by
`GET /api/monitoring/v1/data-quality/coverage` and `.../failures`.

## Upgrade guide

Migrations in `server/db/migrations/` are forward-only and idempotent
(`IF NOT EXISTS` everywhere); `migrateMonitoring()` runs them in order at
boot and records completion in `monitoring.schema_migrations`. To add a
change, create a new `NNNN_name.ts` migration and append it to
`migrations/index.ts` — never edit an already-applied migration file.

## Migration/removal report

See [`legacy-monitoring-removal-report.md`](./legacy-monitoring-removal-report.md)
and [`legacy-monitoring-cleanup-report.json`](./legacy-monitoring-cleanup-report.json).
