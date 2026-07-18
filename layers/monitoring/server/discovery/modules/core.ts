import { defineDiscoveryModule, detectOs, deviceTypeOf } from '../../core/registry'
import { SYS } from '../../snmp/oids'
import { toNumber, toStringValue } from '../../snmp/values'
import { recordEvent } from '../../core/events'

/**
 * Core discovery: system scalars + OS detection. Runs first — later modules
 * read the refreshed os/sysObjectID from the device row via ctx.device.
 */
defineDiscoveryModule({
  name: 'core',
  order: 0,
  defaultEnabled: true,
  requiresSnmp: true,
  async run(ctx) {
    const { db, device, snmp, record } = ctx
    const oids = Object.values(SYS)
    const res = await snmp!.get(oids as unknown as string[])
    if (!res.ok) {
      record('system-scalars', res.outcome, res.error, res.durationMs)
      await db.query(`UPDATE monitoring.devices SET snmp_status = 'down', updated_at = now() WHERE id = $1`, [device.id])
      return { status: 'failed', error: res.error }
    }
    record('system-scalars', 'success', undefined, res.durationMs)

    const sysDescr = toStringValue(res.value[SYS.sysDescr])
    const sysObjectId = toStringValue(res.value[SYS.sysObjectID])
    const sysName = toStringValue(res.value[SYS.sysName])
    const sysContact = toStringValue(res.value[SYS.sysContact])
    const sysLocation = toStringValue(res.value[SYS.sysLocation])
    const upTicks = toNumber(res.value[SYS.sysUpTime])
    const uptimeSeconds = upTicks != null ? Math.floor(upTicks / 100) : null

    const detected = detectOs(sysObjectId, sysDescr)
    const parsed = sysDescr && detected.parseSysDescr ? detected.parseSysDescr(sysDescr) : {}
    const osChanged = !device.os_override && detected.os !== device.os

    // Auto-create/lookup a location from sysLocation (kept in sync unless a
    // manual location was assigned).
    let locationId: number | null = (device.location_id as number | null) ?? null
    if (sysLocation && sysLocation.length > 1) {
      const loc = await db.query(
        `INSERT INTO monitoring.locations (name, from_sys_location) VALUES ($1, true)
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id, from_sys_location`,
        [sysLocation]
      )
      const existing = await db.query('SELECT location_id FROM monitoring.devices WHERE id = $1', [device.id])
      const currentLoc = existing.rows[0]?.location_id
      if (currentLoc == null) locationId = Number(loc.rows[0].id)
      else {
        const cur = await db.query('SELECT from_sys_location FROM monitoring.locations WHERE id = $1', [currentLoc])
        if (cur.rows[0]?.from_sys_location) locationId = Number(loc.rows[0].id)
        else locationId = currentLoc
      }
    }

    await db.query(
      `UPDATE monitoring.devices SET
         sys_descr = $2, sys_object_id = $3, sys_name = $4, sys_contact = $5, sys_location = $6,
         uptime_seconds = COALESCE($7, uptime_seconds),
         os = CASE WHEN os_override IS NULL THEN $8 ELSE os END,
         os_version = COALESCE($9, os_version),
         hardware = CASE WHEN hardware_override IS NULL THEN COALESCE($10, hardware) ELSE hardware END,
         vendor = COALESCE($11, vendor),
         features = COALESCE($12, features),
         location_id = $13,
         device_type = $14,
         snmp_status = 'up',
         updated_at = now()
       WHERE id = $1`,
      [device.id, sysDescr, sysObjectId, sysName, sysContact, sysLocation, uptimeSeconds,
        detected.os, parsed.version ?? null, parsed.hardware ?? null, detected.vendor ?? null,
        parsed.features ?? null, locationId, deviceTypeOf(detected)]
    )

    // Refresh in-memory device row for subsequent modules in this run.
    device.os = device.os_override || detected.os
    device.sys_descr = sysDescr
    device.sys_object_id = sysObjectId
    device.uptime_seconds = uptimeSeconds

    if (osChanged) {
      await recordEvent(db, {
        deviceId: device.id,
        eventType: 'os_detected',
        message: `Operating system detected as ${detected.text} (${detected.os})`
      })
    }
    return { status: 'success' }
  }
})
