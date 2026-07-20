import ping from 'ping'
import { definePollerModule } from '../../core/registry'
import { recordEvent } from '../../core/events'

/**
 * Availability polling (runs first): ICMP reachability + latency, outage
 * tracking, and device up/down status transitions with events. SNMP
 * availability is updated separately by the system module; overall status is
 * derived from both (up / down / degraded).
 */
definePollerModule({
  name: 'availability',
  order: 0,
  defaultEnabled: true,
  requiresSnmp: false,
  async run(ctx) {
    const { db, device, record } = ctx
    const rc = useRuntimeConfig().monitoring as Record<string, any>
    const target = (device.ip as string | null) || device.hostname

    const started = Date.now()
    let alive = false
    let rttMs: number | null = null
    try {
      const res = await ping.promise.probe(target, { timeout: Number(rc.pingTimeoutSeconds ?? 2), min_reply: 1 })
      alive = !!res.alive
      rttMs = res.time === 'unknown' ? null : Number(res.time)
      record('icmp-ping', 'success', alive ? `alive rtt=${rttMs}ms` : 'no reply', Date.now() - started)
    } catch (err: any) {
      record('icmp-ping', 'failed', String(err?.message ?? err), Date.now() - started)
    }

    const wasStatus = String(device.status)
    const icmpStatus = alive ? 'up' : 'down'

    await db.query(
      `UPDATE monitoring.devices SET icmp_status = $2, last_ping_at = now(), last_ping_ms = $3, updated_at = now() WHERE id = $1`,
      [device.id, icmpStatus, rttMs]
    )
    await db.query(
      `INSERT INTO monitoring.metrics (time, device_id, metric, entity_type, entity_id, value)
       VALUES (now(), $1, 'icmp_rtt_ms', 'device', 0, $2), (now(), $1, 'icmp_up', 'device', 0, $3)`,
      [device.id, rttMs, alive ? 1 : 0]
    )

    if (!alive) {
      if (wasStatus !== 'down' && wasStatus !== 'disabled' && wasStatus !== 'maintenance') {
        await db.query(
          `UPDATE monitoring.devices SET status = 'down', status_reason = 'ICMP unreachable', updated_at = now() WHERE id = $1`,
          [device.id]
        )
        await db.query(
          `INSERT INTO monitoring.device_outages (device_id, going_down_at) VALUES ($1, now())`,
          [device.id]
        )
        await recordEvent(db, {
          deviceId: device.id, eventType: 'device_down', severity: 'error',
          message: `Device down: ICMP unreachable (${target})`
        })
      }
      device.status = 'down'
      return { status: 'success', ...( { deviceDown: true } as any) }
    }

    // Alive: close any open outage; final up/degraded verdict comes after the
    // system module updates snmp_status (recomputed there).
    if (wasStatus === 'down' || wasStatus === 'pending') {
      await db.query(
        `UPDATE monitoring.device_outages SET up_again_at = now()
         WHERE device_id = $1 AND up_again_at IS NULL`,
        [device.id]
      )
      await db.query(
        `UPDATE monitoring.devices SET status = 'up', status_reason = NULL, updated_at = now() WHERE id = $1`,
        [device.id]
      )
      if (wasStatus === 'down') {
        await recordEvent(db, {
          deviceId: device.id, eventType: 'device_up', severity: 'info',
          message: `Device recovered: ICMP reachable again (rtt ${rttMs ?? '?'}ms)`
        })
      }
      device.status = 'up'
    } else if (device.snmp_disabled && wasStatus === 'degraded') {
      // ICMP-only devices have no SNMP dimension, so a reachable one is simply
      // "up" — "degraded" is meaningless here. The system module (the only
      // thing that clears 'degraded' → 'up') is skipped for ICMP-only devices,
      // so a 'degraded' left over from before SNMP was disabled would otherwise
      // stick forever. Reachable + ICMP-only ⇒ clear it now.
      await db.query(
        `UPDATE monitoring.devices SET status = 'up', status_reason = NULL, updated_at = now() WHERE id = $1`,
        [device.id]
      )
      device.status = 'up'
    }
    return { status: 'success' }
  }
})
