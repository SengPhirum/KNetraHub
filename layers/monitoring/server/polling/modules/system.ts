import { definePollerModule } from '../../core/registry'
import { SYS } from '../../snmp/oids'
import { toNumber, toStringValue } from '../../snmp/values'
import { detectReboot } from '../../core/counters'
import { recordEvent } from '../../core/events'

/**
 * System polling: sysUpTime (reboot detection), sysName drift, SNMP
 * availability, and the up/degraded overall verdict for SNMP-enabled devices.
 */
definePollerModule({
  name: 'system',
  order: 1,
  defaultEnabled: true,
  requiresSnmp: true,
  async run(ctx) {
    const { db, device, snmp, record } = ctx
    const res = await snmp!.get([SYS.sysUpTime, SYS.sysName])
    if (!res.ok) {
      record('sysUpTime', res.outcome, res.error, res.durationMs)
      await db.query(
        `UPDATE monitoring.devices SET snmp_status = 'down',
           status = CASE WHEN status = 'up' THEN 'degraded' ELSE status END,
           status_reason = CASE WHEN status IN ('up','degraded') THEN 'SNMP unreachable' ELSE status_reason END,
           updated_at = now()
         WHERE id = $1`,
        [device.id]
      )
      if (String(device.snmp_status) === 'up') {
        await recordEvent(db, {
          deviceId: device.id, eventType: 'snmp_down', severity: 'warning',
          message: `SNMP unreachable (${res.outcome})`
        })
      }
      return { status: 'failed', error: res.error }
    }
    record('sysUpTime', 'success', undefined, res.durationMs)

    const upTicks = toNumber(res.value[SYS.sysUpTime])
    const uptimeSeconds = upTicks != null ? Math.floor(upTicks / 100) : null
    const sysName = toStringValue(res.value[SYS.sysName])

    const rebooted = detectReboot(device.uptime_seconds as number | null, uptimeSeconds)
    if (rebooted) {
      await recordEvent(db, {
        deviceId: device.id, eventType: 'device_rebooted', severity: 'warning',
        message: `Device rebooted (uptime ${device.uptime_seconds}s → ${uptimeSeconds}s)`
      })
      await db.query(`UPDATE monitoring.devices SET last_reboot_at = now() WHERE id = $1`, [device.id])
    }

    if (sysName && device.sys_name && sysName !== device.sys_name) {
      await recordEvent(db, {
        deviceId: device.id, eventType: 'sysname_changed', severity: 'warning',
        message: `sysName changed: ${device.sys_name} → ${sysName}`
      })
    }

    const snmpWasDown = String(device.snmp_status) === 'down'
    await db.query(
      `UPDATE monitoring.devices SET snmp_status = 'up',
         uptime_seconds = $2, sys_name = COALESCE($3, sys_name),
         status = CASE WHEN status IN ('degraded','up') THEN 'up' ELSE status END,
         status_reason = CASE WHEN status IN ('degraded','up') THEN NULL ELSE status_reason END,
         updated_at = now()
       WHERE id = $1`,
      [device.id, uptimeSeconds, sysName]
    )
    if (snmpWasDown) {
      await recordEvent(db, { deviceId: device.id, eventType: 'snmp_up', message: 'SNMP reachable again' })
    }

    await db.query(
      `INSERT INTO monitoring.metrics (time, device_id, metric, entity_type, entity_id, value)
       VALUES (now(), $1, 'uptime_seconds', 'device', 0, $2)`,
      [device.id, uptimeSeconds]
    )

    // Expose reboot flag to later counter-based modules in this run.
    ;(device as any)._rebooted = rebooted
    device.uptime_seconds = uptimeSeconds
    return { status: 'success' }
  }
})
