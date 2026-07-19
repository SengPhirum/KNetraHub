import snmp from 'net-snmp'
import { getMonitoringDb as getDb } from '~~/server/utils/moduleDb'
import { convertVarbind } from '../snmp/values'
import { findTrapHandler, defineTrapHandler } from '../core/registry'
import { recordEvent } from '../core/events'
import { TRAPS } from '../snmp/oids'

/**
 * SNMP trap receiver (v1 + v2c TRAP/INFORM over UDP). Every trap is stored
 * with full varbinds; known trap OIDs run a registered handler that produces
 * a typed event; unknown traps are logged, never silently dropped.
 */

let receiver: any = null

// ── Built-in generic trap handlers ──────────────────────────────────────────

defineTrapHandler({
  name: 'linkDown',
  match: [TRAPS.linkDown],
  async handle(ctx) {
    const ifIndex = extractIfIndex(ctx.varbinds)
    if (ctx.deviceId && ifIndex != null) {
      await ctx.db.query(
        `UPDATE monitoring.ports SET oper_status = 'down', last_change_at = now(), updated_at = now()
         WHERE device_id = $1 AND if_index = $2`,
        [ctx.deviceId, ifIndex]
      )
    }
    return { message: `linkDown trap for ifIndex ${ifIndex ?? '?'}`, eventType: 'port_down', severity: 'warning' }
  }
})

defineTrapHandler({
  name: 'linkUp',
  match: [TRAPS.linkUp],
  async handle(ctx) {
    const ifIndex = extractIfIndex(ctx.varbinds)
    if (ctx.deviceId && ifIndex != null) {
      await ctx.db.query(
        `UPDATE monitoring.ports SET oper_status = 'up', last_change_at = now(), updated_at = now()
         WHERE device_id = $1 AND if_index = $2`,
        [ctx.deviceId, ifIndex]
      )
    }
    return { message: `linkUp trap for ifIndex ${ifIndex ?? '?'}`, eventType: 'port_up', severity: 'info' }
  }
})

defineTrapHandler({
  name: 'coldStart',
  match: [TRAPS.coldStart, TRAPS.warmStart],
  async handle(ctx) {
    if (ctx.deviceId) {
      await ctx.db.query(`UPDATE monitoring.devices SET last_reboot_at = now(), updated_at = now() WHERE id = $1`, [ctx.deviceId])
    }
    return { message: 'Device restart trap (cold/warm start)', eventType: 'device_rebooted', severity: 'warning' }
  }
})

defineTrapHandler({
  name: 'authenticationFailure',
  match: [TRAPS.authenticationFailure],
  async handle() {
    return { message: 'SNMP authentication-failure trap', eventType: 'snmp_auth_failure', severity: 'warning' }
  }
})

function extractIfIndex(varbinds: { oid: string; value: unknown }[]): number | null {
  const vb = varbinds.find((v) => v.oid.startsWith('1.3.6.1.2.1.2.2.1.1'))
  const n = vb ? Number(vb.value) : NaN
  return Number.isFinite(n) ? n : null
}

// ── Receiver lifecycle ──────────────────────────────────────────────────────

export function startTrapReceiver(): void {
  if (receiver) return
  const rc = useRuntimeConfig().monitoring as Record<string, any>
  if (!rc.trapEnabled) return
  const port = Number(rc.trapPort ?? 1162)
  const address = String(rc.trapBindAddress ?? '0.0.0.0')

  try {
    receiver = snmp.createReceiver({ port, address, disableAuthorization: true }, (error: unknown, notification: any) => {
      if (error) return
      void processTrap(notification).catch((err) => console.error('[monitoring:traps] processing failed', err))
    })
    console.log(`[monitoring] SNMP trap receiver listening on udp/${address}:${port}`)
  } catch (err) {
    console.error(`[monitoring] failed to start trap receiver on ${address}:${port}`, err)
  }
}

export function stopTrapReceiver(): void {
  try {
    receiver?.close()
  } catch { /* closed */ }
  receiver = null
}

async function processTrap(notification: any): Promise<void> {
  const db = getDb()
  const rinfo = notification?.rinfo ?? {}
  const pdu = notification?.pdu ?? {}
  const sourceIp: string = rinfo.address ?? '0.0.0.0'

  const varbinds = (pdu.varbinds ?? []).map((vb: any) => {
    const converted = convertVarbind(vb)
    return { oid: String(vb.oid), type: converted.typeName, value: converted.value?.toString?.() ?? null }
  })

  // v2c: snmpTrapOID varbind; v1: enterprise + generic/specific
  let trapOid: string | null = null
  const trapOidVb = varbinds.find((vb: any) => vb.oid === TRAPS.snmpTrapOID || vb.oid === TRAPS.snmpTrapOID.replace(/\.0$/, ''))
  if (trapOidVb?.value) trapOid = String(trapOidVb.value)
  else if (pdu.enterprise) {
    const generic = Number(pdu.generic ?? -1)
    const genericMap: Record<number, string> = {
      0: TRAPS.coldStart, 1: TRAPS.warmStart, 2: TRAPS.linkDown, 3: TRAPS.linkUp, 4: TRAPS.authenticationFailure
    }
    trapOid = genericMap[generic] ?? `${pdu.enterprise}.0.${pdu.specific ?? 0}`
  }

  const uptimeVb = varbinds.find((vb: any) => vb.oid === TRAPS.sysUpTimeInstance)
  const version = pdu.type === 166 ? 'v2c' : notification?.pdu?.version === 0 ? 'v1' : 'v2c'

  // Source-device association by management IP or resolved hostname
  const deviceRes = await db.query(
    `SELECT id FROM monitoring.devices WHERE ip = $1::inet OR hostname = $2 LIMIT 1`,
    [sourceIp, sourceIp]
  )
  const deviceId: number | null = deviceRes.rows[0]?.id ?? null

  let handlerName: string | null = null
  let handlerResult: string | null = null
  let eventId: number | null = null
  let error: string | null = null

  if (trapOid) {
    const handler = findTrapHandler(trapOid)
    if (handler) {
      handlerName = handler.name
      try {
        const outcome = await handler.handle({ db, deviceId, sourceIp, trapOid, varbinds })
        if (outcome) {
          handlerResult = outcome.message
          eventId = await recordEvent(db, {
            deviceId, eventType: outcome.eventType, severity: outcome.severity,
            message: `[trap ${sourceIp}] ${outcome.message}`, detail: { trapOid }
          })
        }
      } catch (err: any) {
        error = String(err?.message ?? err)
      }
    } else {
      // Unknown trap: logged as an event unless configured to ignore.
      const setting = await db.query(`SELECT value FROM monitoring.settings WHERE key = 'traps.unknown'`)
      const mode = setting.rows[0]?.value ?? 'log'
      if (mode !== 'ignore') {
        eventId = await recordEvent(db, {
          deviceId, eventType: 'trap_unknown', severity: 'info',
          message: `[trap ${sourceIp}] unknown trap ${trapOid}`, detail: { trapOid, varbinds: varbinds.slice(0, 10) }
        })
      }
    }
  }

  await db.query(
    `INSERT INTO monitoring.traps (device_id, source_ip, snmp_version, enterprise_oid, trap_oid, uptime_ticks, varbinds, handler, handler_result, event_id, error)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [deviceId, sourceIp, version, pdu.enterprise ? String(pdu.enterprise) : null, trapOid,
      uptimeVb ? Number(uptimeVb.value) : null, JSON.stringify(varbinds), handlerName, handlerResult, eventId, error]
  )
}

/** Replay a stored trap through its handler (operator action). */
export async function replayTrap(trapId: number): Promise<{ ok: boolean; result?: string; error?: string }> {
  const db = getDb()
  const row = (await db.query(`SELECT * FROM monitoring.traps WHERE id = $1`, [trapId])).rows[0]
  if (!row) return { ok: false, error: 'trap not found' }
  const handler = row.trap_oid ? findTrapHandler(row.trap_oid) : null
  if (!handler) return { ok: false, error: 'no handler registered for this trap OID' }
  try {
    const outcome = await handler.handle({
      db, deviceId: row.device_id, sourceIp: String(row.source_ip),
      trapOid: row.trap_oid, varbinds: row.varbinds ?? []
    })
    return { ok: true, result: outcome?.message ?? 'handler ran (no message)' }
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err) }
  }
}
