import { definePollerModule } from '../../core/registry'
import { IF, IF_ADMIN_STATUS, IF_OPER_STATUS } from '../../snmp/oids'
import { toBigInt, toNumber } from '../../snmp/values'
import { counterDelta, octetsToBps, utilizationPercent } from '../../core/counters'
import { recordEvent } from '../../core/events'

/**
 * Port polling: every discovered, non-disabled interface. Walks the classic
 * and high-capacity counter columns once each (table-wide, not per-port),
 * computes deltas/rates against monitoring.port_counters with full rollover/
 * reboot/speed-change handling, persists port_metrics samples, and logs
 * state transitions.
 */
definePollerModule({
  name: 'ports',
  order: 10,
  defaultEnabled: true,
  requiresSnmp: true,
  async run(ctx) {
    const { db, device, snmp, record } = ctx
    const intervalSec: number = (ctx as any).intervalSec ?? 300
    const rebooted: boolean = Boolean((device as any)._rebooted)

    const portsRes = await db.query(
      `SELECT p.*, c.polled_at AS c_polled_at, c.in_octets AS c_in, c.out_octets AS c_out,
              c.in_ucast AS c_in_ucast, c.out_ucast AS c_out_ucast,
              c.in_errors AS c_in_err, c.out_errors AS c_out_err,
              c.in_discards AS c_in_disc, c.out_discards AS c_out_disc,
              c.counters_64bit AS c_64, c.speed_bps AS c_speed
       FROM monitoring.ports p
       LEFT JOIN monitoring.port_counters c ON c.port_id = p.id
       WHERE p.device_id = $1 AND NOT p.disabled`,
      [device.id]
    )
    if (!portsRes.rows.length) {
      record('ports', 'skipped', 'no discovered ports')
      return { status: 'empty' }
    }

    const res = await snmp!.table({
      operStatus: IF.ifOperStatus,
      adminStatus: IF.ifAdminStatus,
      inOctets: IF.ifInOctets,
      outOctets: IF.ifOutOctets,
      inUcast: IF.ifInUcastPkts,
      outUcast: IF.ifOutUcastPkts,
      inErrors: IF.ifInErrors,
      outErrors: IF.ifOutErrors,
      inDiscards: IF.ifInDiscards,
      outDiscards: IF.ifOutDiscards,
      hcInOctets: IF.ifHCInOctets,
      hcOutOctets: IF.ifHCOutOctets,
      hcInUcast: IF.ifHCInUcastPkts,
      hcOutUcast: IF.ifHCOutUcastPkts,
      highSpeed: IF.ifHighSpeed
    })
    if (!res.ok) {
      record('ifTable-counters', res.outcome, res.error, res.durationMs)
      return { status: 'failed', error: res.error }
    }
    record('ifTable-counters', 'success', `${res.value.size} rows`, res.durationMs)

    const now = new Date()
    let polled = 0
    for (const port of portsRes.rows) {
      const cols = res.value.get(String(port.if_index))
      if (!cols) {
        record(`ifIndex.${port.if_index}`, 'failed', 'interface missing from walk (possible removal — discovery will reconcile)')
        continue
      }

      const has64 = toBigInt(cols.hcInOctets) != null
      const inOctets = has64 ? toBigInt(cols.hcInOctets) : toBigInt(cols.inOctets)
      const outOctets = has64 ? toBigInt(cols.hcOutOctets) : toBigInt(cols.outOctets)
      const inUcast = has64 ? toBigInt(cols.hcInUcast) ?? toBigInt(cols.inUcast) : toBigInt(cols.inUcast)
      const outUcast = has64 ? toBigInt(cols.hcOutUcast) ?? toBigInt(cols.outUcast) : toBigInt(cols.outUcast)
      const inErrors = toBigInt(cols.inErrors)
      const outErrors = toBigInt(cols.outErrors)
      const inDiscards = toBigInt(cols.inDiscards)
      const outDiscards = toBigInt(cols.outDiscards)

      const highMbps = toNumber(cols.highSpeed)
      const speedBps = highMbps && highMbps > 0 ? highMbps * 1_000_000 : Number(port.speed_bps ?? 0) || null
      const speedChanged = port.c_speed != null && speedBps != null && Number(port.c_speed) !== speedBps

      const operStatus = IF_OPER_STATUS[toNumber(cols.operStatus) ?? 0] ?? 'unknown'
      const adminStatus = IF_ADMIN_STATUS[toNumber(cols.adminStatus) ?? 0] ?? 'unknown'

      // State transition log + event
      if (operStatus !== port.oper_status || adminStatus !== port.admin_status) {
        await db.query(
          `INSERT INTO monitoring.port_state_log (port_id, admin_status, oper_status) VALUES ($1,$2,$3)`,
          [port.id, adminStatus, operStatus]
        )
        await db.query(
          `UPDATE monitoring.ports SET oper_status = $2, admin_status = $3, last_change_at = now(), updated_at = now() WHERE id = $1`,
          [port.id, operStatus, adminStatus]
        )
        if (port.oper_status != null && !port.ignored) {
          await recordEvent(db, {
            deviceId: device.id, entityType: 'port', entityId: Number(port.id),
            eventType: operStatus === 'up' ? 'port_up' : 'port_down',
            severity: operStatus === 'up' ? 'info' : 'warning',
            message: `Port ${port.if_name ?? port.if_descr ?? port.if_index}: ${port.oper_status} → ${operStatus}`
          })
        }
      }

      // Counter deltas
      const elapsed = port.c_polled_at ? (now.getTime() - new Date(port.c_polled_at).getTime()) / 1000 : 0
      const maxBytesPerSec = speedBps ? speedBps / 8 : null
      const mkDelta = (prev: unknown, cur: bigint | null, ceiling: number | null) =>
        counterDelta({
          previous: prev == null ? null : BigInt(String(prev).split('.')[0]),
          current: cur,
          is64bit: has64,
          elapsedSeconds: elapsed,
          maxPerSecond: ceiling,
          deviceRebooted: rebooted || speedChanged
        })

      const dIn = mkDelta(port.c_in, inOctets, maxBytesPerSec)
      const dOut = mkDelta(port.c_out, outOctets, maxBytesPerSec)
      const dInU = mkDelta(port.c_in_ucast, inUcast, null)
      const dOutU = mkDelta(port.c_out_ucast, outUcast, null)
      const dInE = mkDelta(port.c_in_err, inErrors, null)
      const dOutE = mkDelta(port.c_out_err, outErrors, null)
      const dInD = mkDelta(port.c_in_disc, inDiscards, null)
      const dOutD = mkDelta(port.c_out_disc, outDiscards, null)

      const wasReset = [dIn, dOut].some((d) => d.kind === 'reset' && d.reason !== 'first-poll')
      if (dIn.kind === 'rate' && dOut.kind === 'rate') {
        const inBps = octetsToBps(dIn.perSecond)
        const outBps = octetsToBps(dOut.perSecond)
        await db.query(
          `INSERT INTO monitoring.port_metrics
            (time, port_id, device_id, in_bps, out_bps, in_pps, out_pps,
             in_errors_ps, out_errors_ps, in_discards_ps, out_discards_ps,
             in_util_percent, out_util_percent, in_octets_delta, out_octets_delta)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [now, port.id, device.id, inBps, outBps,
            dInU.kind === 'rate' ? dInU.perSecond : null,
            dOutU.kind === 'rate' ? dOutU.perSecond : null,
            dInE.kind === 'rate' ? dInE.perSecond : null,
            dOutE.kind === 'rate' ? dOutE.perSecond : null,
            dInD.kind === 'rate' ? dInD.perSecond : null,
            dOutD.kind === 'rate' ? dOutD.perSecond : null,
            utilizationPercent(inBps, speedBps),
            utilizationPercent(outBps, speedBps),
            dIn.delta.toString(), dOut.delta.toString()]
        )
      }

      // Refresh baseline
      await db.query(
        `INSERT INTO monitoring.port_counters
           (port_id, polled_at, device_uptime_seconds, in_octets, out_octets, in_ucast, out_ucast,
            in_errors, out_errors, in_discards, out_discards, counters_64bit, speed_bps,
            reset_count, last_reset_reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         ON CONFLICT (port_id) DO UPDATE SET
           polled_at = EXCLUDED.polled_at, device_uptime_seconds = EXCLUDED.device_uptime_seconds,
           in_octets = EXCLUDED.in_octets, out_octets = EXCLUDED.out_octets,
           in_ucast = EXCLUDED.in_ucast, out_ucast = EXCLUDED.out_ucast,
           in_errors = EXCLUDED.in_errors, out_errors = EXCLUDED.out_errors,
           in_discards = EXCLUDED.in_discards, out_discards = EXCLUDED.out_discards,
           counters_64bit = EXCLUDED.counters_64bit, speed_bps = EXCLUDED.speed_bps,
           reset_count = monitoring.port_counters.reset_count + $14,
           last_reset_reason = COALESCE($15, monitoring.port_counters.last_reset_reason)`,
        [port.id, now, device.uptime_seconds ?? null,
          inOctets?.toString() ?? null, outOctets?.toString() ?? null,
          inUcast?.toString() ?? null, outUcast?.toString() ?? null,
          inErrors?.toString() ?? null, outErrors?.toString() ?? null,
          inDiscards?.toString() ?? null, outDiscards?.toString() ?? null,
          has64, speedBps,
          wasReset ? 1 : 0,
          wasReset ? (dIn.kind === 'reset' ? dIn.reason : 'discontinuity') : null]
      )
      record(`ifIndex.${port.if_index}`, 'success',
        wasReset ? `counter ${dIn.kind === 'reset' ? dIn.reason : 'reset'} — baseline reseeded` : undefined)
      polled++
    }

    return { status: polled ? 'success' : 'empty' }
  }
})
