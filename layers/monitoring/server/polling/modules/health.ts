import { definePollerModule } from '../../core/registry'
import { toNumber } from '../../snmp/values'
import { recordEvent } from '../../core/events'

/**
 * Health polling: refresh current values for every discovered processor,
 * mempool, storage entity, and sensor by re-reading the exact OIDs discovery
 * registered. Values persist to entity rows (current) + metrics hypertables
 * (history); sensor thresholds evaluate to ok/warning/critical with events
 * on transitions.
 */

definePollerModule({
  name: 'processors',
  order: 20,
  defaultEnabled: true,
  requiresSnmp: true,
  async run(ctx) {
    const { db, device, snmp, record } = ctx
    const procs = await db.query(
      `SELECT id, proc_oid, proc_index, source, description FROM monitoring.processors
       WHERE device_id = $1 AND stale_since IS NULL`,
      [device.id]
    )
    if (!procs.rows.length) {
      record('processors', 'skipped', 'none discovered')
      return { status: 'empty' }
    }
    const oids: string[] = procs.rows.map((p: any) => p.proc_oid)
    const res = await snmp!.get(oids)
    if (!res.ok) {
      record('processor-values', res.outcome, res.error, res.durationMs)
      return { status: 'failed', error: res.error }
    }
    const now = new Date()
    for (const proc of procs.rows) {
      const raw = toNumber(res.value[proc.proc_oid])
      // UCD source stores idle → usage conversion happened at discovery; here
      // the ucd aggregate OID is ssCpuIdle so invert again.
      const usage = raw == null ? null : proc.source === 'ucd' ? Math.max(0, 100 - raw) : raw
      if (usage == null) {
        record(`proc.${proc.proc_index}`, 'unsupported', 'no value returned')
        continue
      }
      await db.query(
        `UPDATE monitoring.processors SET usage_percent = $2, polled_at = now(), updated_at = now() WHERE id = $1`,
        [proc.id, usage]
      )
      await db.query(
        `INSERT INTO monitoring.metrics (time, device_id, metric, entity_type, entity_id, value)
         VALUES ($1, $2, 'processor_usage', 'processor', $3, $4)`,
        [now, device.id, proc.id, usage]
      )
      // Keep the hrDevice inventory Load column current between discoveries
      // (hrProcessorLoad is indexed by hrDeviceIndex).
      if (proc.source === 'hr' && /^\d+$/.test(proc.proc_index)) {
        await db.query(
          `UPDATE monitoring.hr_devices SET load_percent = $3, updated_at = now()
           WHERE device_id = $1 AND hr_index = $2`,
          [device.id, Number(proc.proc_index), usage]
        )
      }
      record(`proc.${proc.proc_index}`, 'success')
    }
    return { status: 'success' }
  }
})

definePollerModule({
  name: 'mempools',
  order: 21,
  defaultEnabled: true,
  requiresSnmp: true,
  async run(ctx) {
    const { db, device, record } = ctx
    // Mempool source OIDs are scalar sets; simplest correct refresh is to
    // re-run the discovery collector logic — but to keep polling cheap we
    // re-read the same tables the discovery module used via a shared helper.
    // Here: re-read via discovery module is heavy; instead read hr/ucd values
    // directly per stored row source.
    const pools = await db.query(
      `SELECT id, source, mempool_index, is_swap FROM monitoring.mempools
       WHERE device_id = $1 AND stale_since IS NULL`,
      [device.id]
    )
    if (!pools.rows.length) {
      record('mempools', 'skipped', 'none discovered')
      return { status: 'empty' }
    }
    const { UCD, HR } = await import('../../snmp/oids')
    const snmp = ctx.snmp!
    const now = new Date()
    let ok = 0

    const ucdPools = pools.rows.filter((p: any) => p.source === 'ucd')
    if (ucdPools.length) {
      const res = await snmp.get([UCD.memTotalReal, UCD.memAvailReal, UCD.memBuffer, UCD.memCached, UCD.memTotalSwap, UCD.memAvailSwap])
      if (res.ok) {
        record('ucdMemory', 'success', undefined, res.durationMs)
        for (const pool of ucdPools) {
          const totalKb = toNumber(res.value[pool.is_swap ? UCD.memTotalSwap : UCD.memTotalReal])
          const availKb = toNumber(res.value[pool.is_swap ? UCD.memAvailSwap : UCD.memAvailReal]) ?? 0
          if (totalKb == null || totalKb <= 0) {
            record(`mempool.${pool.mempool_index}`, 'unsupported', 'no value')
            continue
          }
          const bufferKb = pool.is_swap ? 0 : toNumber(res.value[UCD.memBuffer]) ?? 0
          const cachedKb = pool.is_swap ? 0 : toNumber(res.value[UCD.memCached]) ?? 0
          const usedKb = Math.max(0, totalKb - availKb - bufferKb - cachedKb)
          const pct = (usedKb / totalKb) * 100
          await db.query(
            `UPDATE monitoring.mempools SET total_bytes = $2, used_bytes = $3, free_bytes = $4,
               cached_bytes = $5, buffered_bytes = $6, usage_percent = $7, polled_at = now(), updated_at = now()
             WHERE id = $1`,
            [pool.id, totalKb * 1024, usedKb * 1024, availKb * 1024, cachedKb * 1024, bufferKb * 1024, pct]
          )
          // Byte-level series alongside percent: the device memory graph
          // stacks used/buffers/cached the way LibreNMS renders it.
          await db.query(
            `INSERT INTO monitoring.metrics (time, device_id, metric, entity_type, entity_id, value) VALUES
               ($1,$2,'mempool_usage_percent','mempool',$3,$4),
               ($1,$2,'mempool_used_bytes','mempool',$3,$5),
               ($1,$2,'mempool_free_bytes','mempool',$3,$6),
               ($1,$2,'mempool_cached_bytes','mempool',$3,$7),
               ($1,$2,'mempool_buffered_bytes','mempool',$3,$8),
               ($1,$2,'mempool_total_bytes','mempool',$3,$9)`,
            [now, device.id, pool.id, pct, usedKb * 1024, availKb * 1024, cachedKb * 1024, bufferKb * 1024, totalKb * 1024]
          )
          record(`mempool.${pool.mempool_index}`, 'success')
          ok++
        }
      } else {
        record('ucdMemory', res.outcome, res.error, res.durationMs)
      }
    }

    const hrPools = pools.rows.filter((p: any) => p.source === 'hr')
    for (const pool of hrPools) {
      const res = await snmp.get([
        `${HR.hrStorageAllocationUnits}.${pool.mempool_index}`,
        `${HR.hrStorageSize}.${pool.mempool_index}`,
        `${HR.hrStorageUsed}.${pool.mempool_index}`
      ])
      if (!res.ok) {
        record(`mempool.${pool.mempool_index}`, res.outcome, res.error)
        continue
      }
      const units = toNumber(res.value[`${HR.hrStorageAllocationUnits}.${pool.mempool_index}`]) ?? 1
      const size = (toNumber(res.value[`${HR.hrStorageSize}.${pool.mempool_index}`]) ?? 0) * units
      const used = (toNumber(res.value[`${HR.hrStorageUsed}.${pool.mempool_index}`]) ?? 0) * units
      if (size <= 0) {
        record(`mempool.${pool.mempool_index}`, 'unsupported', 'zero size')
        continue
      }
      const pct = (used / size) * 100
      await db.query(
        `UPDATE monitoring.mempools SET total_bytes = $2, used_bytes = $3, free_bytes = $4,
           usage_percent = $5, polled_at = now(), updated_at = now() WHERE id = $1`,
        [pool.id, size, used, size - used, pct]
      )
      await db.query(
        `INSERT INTO monitoring.metrics (time, device_id, metric, entity_type, entity_id, value) VALUES
           ($1,$2,'mempool_usage_percent','mempool',$3,$4),
           ($1,$2,'mempool_used_bytes','mempool',$3,$5),
           ($1,$2,'mempool_free_bytes','mempool',$3,$6),
           ($1,$2,'mempool_total_bytes','mempool',$3,$7)`,
        [now, device.id, pool.id, pct, used, size - used, size]
      )
      record(`mempool.${pool.mempool_index}`, 'success')
      ok++
    }

    return { status: ok ? 'success' : 'failed', error: ok ? undefined : 'no mempool values collected' }
  }
})

definePollerModule({
  name: 'storage',
  order: 22,
  defaultEnabled: true,
  requiresSnmp: true,
  async run(ctx) {
    const { db, device, snmp, record } = ctx
    const { HR } = await import('../../snmp/oids')
    const rows = await db.query(
      `SELECT id, storage_index, description, allocation_units FROM monitoring.storage
       WHERE device_id = $1 AND stale_since IS NULL AND source = 'hr'`,
      [device.id]
    )
    if (!rows.rows.length) {
      record('storage', 'skipped', 'none discovered')
      return { status: 'empty' }
    }
    // One table walk covers every filesystem — cheaper than N gets.
    const res = await snmp!.table({ units: HR.hrStorageAllocationUnits, size: HR.hrStorageSize, used: HR.hrStorageUsed })
    if (!res.ok) {
      record('hrStorageTable', res.outcome, res.error, res.durationMs)
      return { status: 'failed', error: res.error }
    }
    record('hrStorageTable', 'success', `${res.value.size} rows`, res.durationMs)
    const now = new Date()
    let ok = 0
    for (const st of rows.rows) {
      const cols = res.value.get(String(st.storage_index))
      if (!cols) {
        record(`storage.${st.storage_index}`, 'failed', 'row missing from walk')
        continue
      }
      const units = toNumber(cols.units) ?? st.allocation_units ?? 1
      const size = (toNumber(cols.size) ?? 0) * units
      const used = (toNumber(cols.used) ?? 0) * units
      if (size <= 0) {
        record(`storage.${st.storage_index}`, 'unsupported', 'zero size')
        continue
      }
      const pct = (used / size) * 100
      await db.query(
        `UPDATE monitoring.storage SET total_bytes = $2, used_bytes = $3, free_bytes = $4,
           usage_percent = $5, polled_at = now(), updated_at = now() WHERE id = $1`,
        [st.id, size, used, size - used, pct]
      )
      await db.query(
        `INSERT INTO monitoring.metrics (time, device_id, metric, entity_type, entity_id, value)
         VALUES ($1,$2,'storage_usage_percent','storage',$3,$4)`,
        [now, device.id, st.id, pct]
      )
      record(`storage.${st.storage_index}`, 'success')
      ok++
    }
    return { status: ok ? 'success' : 'failed', error: ok ? undefined : 'no storage values collected' }
  }
})

definePollerModule({
  name: 'sensors',
  order: 23,
  defaultEnabled: true,
  requiresSnmp: true,
  async run(ctx) {
    const { db, device, snmp, record } = ctx
    const sensors = await db.query(
      `SELECT * FROM monitoring.sensors WHERE device_id = $1 AND stale_since IS NULL`,
      [device.id]
    )
    if (!sensors.rows.length) {
      record('sensors', 'skipped', 'none discovered')
      return { status: 'empty' }
    }

    const now = new Date()
    // Chunked multi-OID GETs (net-snmp packets stay small).
    const chunkSize = 20
    let ok = 0
    for (let i = 0; i < sensors.rows.length; i += chunkSize) {
      const chunk = sensors.rows.slice(i, i + chunkSize)
      const res = await snmp!.get(chunk.map((s: any) => s.sensor_oid))
      if (!res.ok) {
        for (const s of chunk) record(`sensor.${s.sensor_class}.${s.sensor_index}`, res.outcome, res.error)
        continue
      }
      for (const sensor of chunk) {
        const raw = toNumber(res.value[sensor.sensor_oid])
        if (raw == null) {
          record(`sensor.${sensor.sensor_class}.${sensor.sensor_index}`, 'unsupported', 'no value')
          continue
        }
        const value = (raw * Number(sensor.multiplier || 1)) / Number(sensor.divisor || 1)

        // Threshold / state evaluation
        let status: 'ok' | 'warning' | 'critical' = 'ok'
        if (sensor.sensor_class === 'state' && sensor.state_translations) {
          const translations = typeof sensor.state_translations === 'string'
            ? JSON.parse(sensor.state_translations)
            : sensor.state_translations
          const tr = translations?.[String(raw)]
          status = tr?.severity === 'critical' ? 'critical' : tr?.severity === 'warning' ? 'warning' : 'ok'
        } else {
          if (sensor.crit_low != null && value < Number(sensor.crit_low)) status = 'critical'
          else if (sensor.crit_high != null && value > Number(sensor.crit_high)) status = 'critical'
          else if (sensor.warn_low != null && value < Number(sensor.warn_low)) status = 'warning'
          else if (sensor.warn_high != null && value > Number(sensor.warn_high)) status = 'warning'
        }

        if (status !== sensor.status) {
          await recordEvent(db, {
            deviceId: device.id, entityType: 'sensor', entityId: Number(sensor.id),
            eventType: `sensor_${status}`,
            severity: status === 'critical' ? 'error' : status === 'warning' ? 'warning' : 'info',
            message: `Sensor ${sensor.description}: ${sensor.status} → ${status} (${value}${sensor.unit ?? ''})`
          })
        }

        await db.query(
          `UPDATE monitoring.sensors SET current_value = $2, status = $3, polled_at = now(), updated_at = now() WHERE id = $1`,
          [sensor.id, value, status]
        )
        await db.query(
          `INSERT INTO monitoring.sensor_metrics (time, sensor_id, device_id, value) VALUES ($1,$2,$3,$4)`,
          [now, sensor.id, device.id, value]
        )
        record(`sensor.${sensor.sensor_class}.${sensor.sensor_index}`, 'success')
        ok++
      }
    }
    return { status: ok ? 'success' : 'failed', error: ok ? undefined : 'no sensor values collected' }
  }
})
