# Monitoring CLI Guide

Status: **Not yet implemented.** Tracked as `Blocked` in
[`librenms-feature-parity.md`](./librenms-feature-parity.md) (System
administration section).

## Current equivalents

Every capability the CLI would expose is already reachable today through the
REST API (`docs/monitoring/api.md`) with the same RBAC enforcement, which is
why this was not blocking for the rebuild's functional completeness:

| Intended CLI command | Current equivalent |
|---|---|
| Add device | `POST /api/monitoring/v1/devices` |
| Delete device | `DELETE /api/monitoring/v1/devices/:id` |
| Discover device / all | `POST /api/monitoring/v1/devices/:id/discover`, or wait for the 6h cycle |
| Poll device / all | `POST /api/monitoring/v1/devices/:id/poll` |
| Retry failed jobs / replay dead-letter | `POST /api/monitoring/v1/pollers/jobs/:id/replay` |
| Test SNMP credentials | Add the device with `force`-style settings and check `snmp_status` after one poll (a dedicated dry-run test endpoint is not yet implemented) |
| Test alert transport | `POST /api/monitoring/v1/alerts/transports/:id/test` |
| Generate collection-completeness report | `GET /api/monitoring/v1/data-quality/coverage` |

## Planned shape

A future `layers/monitoring/server/commands/` directory would host
Nitro-invocable command handlers (mirroring the API's business logic, not
duplicating it) exposed via a thin `npx knetrahub-monitoring <cmd>` wrapper
in `scripts/`, each supporting `--json`, `--verbose`, and standard exit codes,
with the same secret redaction rules as the API and audit logging via
`auditMonitoring()`. This is recorded here as the concrete target rather than
implemented speculatively, per the project's no-speculative-code guidance.
