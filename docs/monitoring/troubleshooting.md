# Monitoring Troubleshooting Guide

## Device stuck in "pending"

Discovery hasn't completed yet. Check `GET /api/monitoring/v1/data-quality/failures?device_id=<id>`
for the reason — most commonly SNMP `timeout` (device unreachable on
UDP/161 or wrong credentials) or `auth_failure` (SNMPv3 credentials wrong).
The device row's `status_reason` also carries the last-known cause.

## Device shows "degraded"

ICMP is up but SNMP is down (`snmp_status = 'down'`). Verify:
1. SNMP is enabled on the device and the community/v3 credentials match.
2. UDP/161 is reachable from the poller node (firewall, ACL).
3. `NUXT_MONITORING_SNMP_TIMEOUT_MS` isn't too aggressive for a slow device.

## No interface bit-rates / rates show as zero

Rates come from counter deltas — the **first** poll after discovery only
seeds `monitoring.port_counters`; rates appear from the second poll onward.
If they never appear, check `collection_attempts` for the `ports` module's
outcome on that device (`ifTable-counters`) — a `timeout` there means the
walk itself is failing, not just the delta math.

## Counters look reset / rates spike then drop

Expected on: device reboot (uptime regression → automatic baseline reseed),
`ifHighSpeed` change (treated as a discontinuity to avoid garbage deltas),
or an actual device-side counter clear. Check `port_counters.reset_count`
and `last_reset_reason` for the specific port.

## Alerts never fire even though the rule matches in the UI preview

1. Confirm the rule is `enabled`.
2. Check `delay_seconds` — the condition must hold continuously for that long
   before the first notification.
3. Check for an active maintenance window or a "down" parent device
   (dependency suppression) — the alert **incident still opens** in state
   `suppressed`, it just doesn't notify. Look at `GET /api/monitoring/v1/alerts?state=suppressed`.
4. If the rule has no transport assigned and no default transport exists,
   the alert still opens but no notification is attempted — assign a
   transport or mark one `is_default`.

## Notifications fail silently

Every delivery attempt is recorded in `monitoring.alert_notifications`
(redacted). Query it for the alert or use the transport's **Test** action in
the UI, which surfaces the exact error (HTTP status, timeout, SSRF guard
rejection for disallowed hosts, etc.).

## Traps/syslog not appearing

Both receivers are **opt-in** (`NUXT_MONITORING_TRAP_ENABLED` /
`NUXT_MONITORING_SYSLOG_ENABLED`, default `false`) and bind to non-privileged
ports (1162/1514) by default — forward the standard ports (162/514) to those
in production, or run the container with `CAP_NET_BIND_SERVICE` and set the
port env vars to 162/514 directly. Once enabled, check
`GET /api/monitoring/v1/system/status` for `receivers.syslog` counters
(`received`, `parseFailures`, `unknownDevices`) and `receivers.last_trap_at`.

## Discovery keeps re-adding/removing the same entities

This should not happen by design — `core/reconcile.ts` only marks entities
stale after a **successful** discovery no longer sees them, and only purges
after `STALE_MISS_THRESHOLD` (3) consecutive confirmed absences. If it's
still flapping, check `collection_attempts` for that module — an
intermittently truncated walk (`res.ok === false` after partial rows) never
reaches `reconcile()` at all, so flapping usually points to two different
credential profiles/contexts alternating, not a reconciliation bug.

## Jobs pile up / dispatcher looks stuck

Check `GET /api/monitoring/v1/pollers` — `pending_due` and `oldest_pending`
show queue backlog; `nodes[].healthy` (heartbeat within 30s) shows whether any
worker is actually claiming jobs. A `false` on every node with
`NUXT_MONITORING_DISPATCHER_ENABLED=true` means the Nitro plugin
(`plugins/monitoringBootstrap.ts`) failed at boot — check server logs for
`[monitoring] bootstrap failed`.

## "Suspect empty" warnings in discovery

A module reports `failed` with a message like *"table unexpectedly empty
(previous discovery had rows)"* when a device that previously had N ports/
sensors/etc. now returns zero on an otherwise-successful walk. This is
usually an agent restart mid-walk or an ACL change, not a real removal — the
existing rows are deliberately **not** wiped; investigate the device side.

## Data Collection page shows "incomplete" but everything looks fine

`incomplete` just means at least one item had a non-success, non-skipped
outcome on the last run — including a single `unsupported` OID that's
expected to be absent on that hardware. Drill into
`/monitoring/data-collection` → Failures, filtered to the device, to see the
exact item and outcome before assuming something is actually broken.
