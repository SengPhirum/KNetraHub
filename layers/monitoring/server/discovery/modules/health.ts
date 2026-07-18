import { defineDiscoveryModule } from '../../core/registry'
import { reconcile } from '../../core/reconcile'
import { HR, HR_STORAGE_TYPES, UCD, ENT_SENSOR, ENT_SENSOR_TYPES, ENT_SENSOR_SCALE, ENTITY, UPS, PRINTER } from '../../snmp/oids'
import { toNumber, toStringValue } from '../../snmp/values'

/**
 * Health discovery: processors, memory pools, storage, and sensors from the
 * standard MIBs (HOST-RESOURCES, UCD, ENTITY-SENSOR, LM-SENSORS, UPS-MIB,
 * Printer-MIB). Every instance found is registered — never only the first.
 */

/** Processors: hrProcessorTable, falling back to UCD ssCpu aggregate. */
defineDiscoveryModule({
  name: 'processors',
  order: 40,
  defaultEnabled: true,
  requiresSnmp: true,
  async run(ctx) {
    const { db, device, snmp, record } = ctx
    const found: Record<string, unknown>[] = []

    const hr = await snmp!.walk(HR.hrProcessorLoad)
    if (hr.ok && hr.value.length) {
      record('hrProcessorTable', 'success', `${hr.value.length} processors`, hr.durationMs)
      const descrs = await snmp!.walk(HR.hrDeviceDescr)
      const descrByIndex = new Map<string, string>()
      if (descrs.ok) for (const d of descrs.value) descrByIndex.set(d.index, toStringValue(d.value) ?? '')
      for (const row of hr.value) {
        found.push({
          source: 'hr',
          proc_oid: `${HR.hrProcessorLoad}.${row.index}`,
          proc_index: row.index,
          description: descrByIndex.get(row.index) || `Processor ${row.index}`,
          usage_percent: toNumber(row.value)
        })
      }
    } else {
      record('hrProcessorTable', hr.ok ? 'empty' : hr.outcome, hr.ok ? undefined : hr.error, hr.durationMs)
      const ucd = await snmp!.getOne(UCD.ssCpuIdle)
      if (ucd.ok && ucd.value?.value != null) {
        record('ucdSsCpu', 'success', undefined, ucd.durationMs)
        const idle = toNumber(ucd.value)
        found.push({
          source: 'ucd',
          proc_oid: UCD.ssCpuIdle,
          proc_index: '0',
          description: 'CPU (UCD aggregate)',
          usage_percent: idle != null ? Math.max(0, 100 - idle) : null
        })
      } else {
        record('ucdSsCpu', ucd.ok ? 'unsupported' : ucd.outcome, ucd.ok ? 'no value' : ucd.error)
      }
    }

    if (!found.length) return { status: 'unsupported' }
    const rec = await reconcile({
      db, table: 'monitoring.processors', deviceId: device.id,
      identityColumns: ['proc_oid', 'proc_index'],
      updateColumns: ['source', 'description', 'usage_percent'],
      found
    })
    record('processors-reconcile', 'success', `+${rec.inserted} ~${rec.updated} stale:${rec.markedStale}`)
    return { status: 'success' }
  }
})

/** Memory pools: UCD memory scalars + hrStorage RAM/virtual-memory rows. */
defineDiscoveryModule({
  name: 'mempools',
  order: 41,
  defaultEnabled: true,
  requiresSnmp: true,
  async run(ctx) {
    const { db, device, snmp, record } = ctx
    const found: Record<string, unknown>[] = []

    const ucd = await snmp!.get([UCD.memTotalReal, UCD.memAvailReal, UCD.memBuffer, UCD.memCached, UCD.memTotalSwap, UCD.memAvailSwap])
    if (ucd.ok && toNumber(ucd.value[UCD.memTotalReal]) != null) {
      record('ucdMemory', 'success', undefined, ucd.durationMs)
      const totalKb = toNumber(ucd.value[UCD.memTotalReal])!
      const availKb = toNumber(ucd.value[UCD.memAvailReal]) ?? 0
      const bufferKb = toNumber(ucd.value[UCD.memBuffer]) ?? 0
      const cachedKb = toNumber(ucd.value[UCD.memCached]) ?? 0
      const usedKb = Math.max(0, totalKb - availKb - bufferKb - cachedKb)
      found.push({
        source: 'ucd', mempool_index: 'real', description: 'Physical memory',
        total_bytes: totalKb * 1024, used_bytes: usedKb * 1024, free_bytes: availKb * 1024,
        cached_bytes: cachedKb * 1024, buffered_bytes: bufferKb * 1024,
        usage_percent: totalKb > 0 ? (usedKb / totalKb) * 100 : null, is_swap: false
      })
      const swapTotalKb = toNumber(ucd.value[UCD.memTotalSwap])
      if (swapTotalKb != null && swapTotalKb > 0) {
        const swapAvailKb = toNumber(ucd.value[UCD.memAvailSwap]) ?? 0
        const swapUsedKb = Math.max(0, swapTotalKb - swapAvailKb)
        found.push({
          source: 'ucd', mempool_index: 'swap', description: 'Swap',
          total_bytes: swapTotalKb * 1024, used_bytes: swapUsedKb * 1024, free_bytes: swapAvailKb * 1024,
          cached_bytes: null, buffered_bytes: null,
          usage_percent: (swapUsedKb / swapTotalKb) * 100, is_swap: true
        })
      }
    } else {
      record('ucdMemory', ucd.ok ? 'unsupported' : ucd.outcome, ucd.ok ? 'no UCD memory' : ucd.error, ucd.durationMs)
    }

    // hrStorage RAM/virtual memory as mempools (covers Windows + appliances)
    const hr = await snmp!.table({
      type: HR.hrStorageType, descr: HR.hrStorageDescr,
      units: HR.hrStorageAllocationUnits, size: HR.hrStorageSize, used: HR.hrStorageUsed
    })
    if (hr.ok) {
      let hrCount = 0
      for (const [index, cols] of hr.value) {
        const type = toStringValue(cols.type) ?? ''
        const isRam = type === HR_STORAGE_TYPES.ram
        const isVirt = type === HR_STORAGE_TYPES.virtualMemory
        if (!isRam && !isVirt) continue
        const units = toNumber(cols.units) ?? 1
        const size = (toNumber(cols.size) ?? 0) * units
        const used = (toNumber(cols.used) ?? 0) * units
        if (size <= 0) continue
        hrCount++
        found.push({
          source: 'hr', mempool_index: index,
          description: toStringValue(cols.descr) ?? (isRam ? 'Physical memory' : 'Virtual memory'),
          total_bytes: size, used_bytes: used, free_bytes: size - used,
          cached_bytes: null, buffered_bytes: null,
          usage_percent: (used / size) * 100, is_swap: isVirt
        })
      }
      record('hrStorage-mem', hrCount ? 'success' : 'empty', `${hrCount} pools`, hr.durationMs)
    } else {
      record('hrStorage-mem', hr.outcome, hr.error, hr.durationMs)
    }

    if (!found.length) return { status: 'unsupported' }
    const rec = await reconcile({
      db, table: 'monitoring.mempools', deviceId: device.id,
      identityColumns: ['source', 'mempool_index'],
      updateColumns: ['description', 'total_bytes', 'used_bytes', 'free_bytes', 'cached_bytes', 'buffered_bytes', 'usage_percent', 'is_swap'],
      found
    })
    record('mempools-reconcile', 'success', `+${rec.inserted} ~${rec.updated} stale:${rec.markedStale}`)
    return { status: 'success' }
  }
})

/** Storage: every hrStorage fixed-disk row (all filesystems, not just /). */
defineDiscoveryModule({
  name: 'storage',
  order: 42,
  defaultEnabled: true,
  requiresSnmp: true,
  async run(ctx) {
    const { db, device, snmp, record } = ctx
    const hr = await snmp!.table({
      type: HR.hrStorageType, descr: HR.hrStorageDescr,
      units: HR.hrStorageAllocationUnits, size: HR.hrStorageSize, used: HR.hrStorageUsed
    })
    if (!hr.ok) {
      record('hrStorageTable', hr.outcome, hr.error, hr.durationMs)
      return { status: hr.outcome === 'unsupported' ? 'unsupported' : 'failed', error: hr.error }
    }

    const found: Record<string, unknown>[] = []
    for (const [index, cols] of hr.value) {
      const type = toStringValue(cols.type) ?? ''
      if (type !== HR_STORAGE_TYPES.fixedDisk) continue
      const units = toNumber(cols.units) ?? 1
      const size = (toNumber(cols.size) ?? 0) * units
      const used = (toNumber(cols.used) ?? 0) * units
      if (size <= 0) continue
      found.push({
        source: 'hr', storage_index: index,
        description: toStringValue(cols.descr) ?? `Storage ${index}`,
        storage_type: 'fixedDisk', allocation_units: units,
        total_bytes: size, used_bytes: used, free_bytes: size - used,
        usage_percent: (used / size) * 100
      })
    }
    record('hrStorageTable', found.length ? 'success' : 'empty', `${found.length} filesystems`, hr.durationMs)

    if (!found.length) return { status: 'empty' }
    const rec = await reconcile({
      db, table: 'monitoring.storage', deviceId: device.id,
      identityColumns: ['source', 'storage_index'],
      updateColumns: ['description', 'storage_type', 'allocation_units', 'total_bytes', 'used_bytes', 'free_bytes', 'usage_percent'],
      found
    })
    record('storage-reconcile', 'success', `+${rec.inserted} ~${rec.updated} stale:${rec.markedStale}`)
    return { status: 'success' }
  }
})

/**
 * Sensors: ENTITY-SENSOR-MIB (typed, scaled, entity-linked), LM-SENSORS
 * (net-snmp Linux), UPS-MIB battery/output scalars, Printer-MIB supplies.
 * Every table row becomes one sensor.
 */
defineDiscoveryModule({
  name: 'sensors',
  order: 43,
  defaultEnabled: true,
  requiresSnmp: true,
  async run(ctx) {
    const { db, device, snmp, record } = ctx
    const found: Record<string, unknown>[] = []

    // ── ENTITY-SENSOR-MIB ──
    const ent = await snmp!.table({
      type: ENT_SENSOR.entPhySensorType,
      scale: ENT_SENSOR.entPhySensorScale,
      precision: ENT_SENSOR.entPhySensorPrecision,
      value: ENT_SENSOR.entPhySensorValue
    })
    if (ent.ok && ent.value.size) {
      record('entPhySensorTable', 'success', `${ent.value.size} sensors`, ent.durationMs)
      const names = await snmp!.walk(ENTITY.entPhysicalName)
      const nameByIndex = new Map<string, string>()
      if (names.ok) for (const n of names.value) nameByIndex.set(n.index, toStringValue(n.value) ?? '')
      for (const [index, cols] of ent.value) {
        const typeInfo = ENT_SENSOR_TYPES[toNumber(cols.type) ?? 0]
        if (!typeInfo) continue
        const scaleExp = ENT_SENSOR_SCALE[toNumber(cols.scale) ?? 9] ?? 0
        const precision = toNumber(cols.precision) ?? 0
        // value * 10^scale / 10^precision → normalized; expressed via divisor/multiplier
        const multiplier = Math.pow(10, scaleExp)
        const divisor = Math.pow(10, precision)
        const raw = toNumber(cols.value)
        found.push({
          sensor_class: typeInfo.cls,
          sensor_oid: `${ENT_SENSOR.entPhySensorValue}.${index}`,
          sensor_index: index,
          description: nameByIndex.get(index) || `Sensor ${index}`,
          sensor_group: 'entity-sensor',
          unit: typeInfo.unit,
          divisor, multiplier,
          current_value: raw != null ? (raw * multiplier) / divisor : null,
          entity_ref: index,
          source: 'entity-sensor'
        })
      }
    } else {
      record('entPhySensorTable', ent.ok ? 'empty' : ent.outcome, ent.ok ? undefined : ent.error, ent.durationMs)
    }

    // ── LM-SENSORS (net-snmp) ──
    const lmGroups: [string, string, string, string, number][] = [
      // class, deviceOid, valueOid, unit, divisor
      ['temperature', UCD.lmTempSensorsDevice, UCD.lmTempSensorsValue, '°C', 1000],
      ['fanspeed', UCD.lmFanSensorsDevice, UCD.lmFanSensorsValue, 'rpm', 1],
      ['voltage', UCD.lmVoltSensorsDevice, UCD.lmVoltSensorsValue, 'V', 1000]
    ]
    for (const [cls, devOid, valOid, unit, divisor] of lmGroups) {
      const vals = await snmp!.walk(valOid)
      if (!vals.ok || !vals.value.length) {
        record(`lm-${cls}`, vals.ok ? 'empty' : vals.outcome, vals.ok ? undefined : vals.error, vals.durationMs)
        continue
      }
      record(`lm-${cls}`, 'success', `${vals.value.length} sensors`, vals.durationMs)
      const devs = await snmp!.walk(devOid)
      const nameByIndex = new Map<string, string>()
      if (devs.ok) for (const d of devs.value) nameByIndex.set(d.index, toStringValue(d.value) ?? '')
      for (const row of vals.value) {
        const raw = toNumber(row.value)
        found.push({
          sensor_class: cls,
          sensor_oid: `${valOid}.${row.index}`,
          sensor_index: row.index,
          description: nameByIndex.get(row.index) || `${cls} ${row.index}`,
          sensor_group: 'lm-sensors',
          unit, divisor, multiplier: 1,
          current_value: raw != null ? raw / divisor : null,
          entity_ref: null,
          source: 'lm-sensors'
        })
      }
    }

    // ── UCD load averages + HOST-RESOURCES counters ──
    // Present on virtually every net-snmp agent (Linux/BSD servers, many
    // appliances) — guarantees Linux hosts get sensors even without
    // lm-sensors/ENTITY-SENSOR support in snmpd.
    const la = await snmp!.get([UCD.laLoad1, UCD.laLoad5, UCD.laLoad15])
    if (la.ok && toNumber(la.value[UCD.laLoad1]) != null) {
      record('ucdLaLoad', 'success', undefined, la.durationMs)
      const laDefs: [string, string][] = [
        [UCD.laLoad1, 'Load average (1 min)'],
        [UCD.laLoad5, 'Load average (5 min)'],
        [UCD.laLoad15, 'Load average (15 min)']
      ]
      for (const [oid, descr] of laDefs) {
        const value = toNumber(la.value[oid])
        if (value == null) continue
        found.push({
          sensor_class: 'load', sensor_oid: oid, sensor_index: '0',
          description: descr, sensor_group: 'ucd', unit: '',
          divisor: 1, multiplier: 1, current_value: value,
          entity_ref: null, source: 'ucd-mib'
        })
      }
    } else {
      record('ucdLaLoad', la.ok ? 'unsupported' : la.outcome, la.ok ? 'no value' : la.error, la.durationMs)
    }

    const hrCounts = await snmp!.get([HR.hrSystemProcesses, HR.hrSystemNumUsers])
    if (hrCounts.ok && (toNumber(hrCounts.value[HR.hrSystemProcesses]) != null || toNumber(hrCounts.value[HR.hrSystemNumUsers]) != null)) {
      record('hrSystemCounts', 'success', undefined, hrCounts.durationMs)
      const hrDefs: [string, string][] = [
        [HR.hrSystemProcesses, 'Running processes'],
        [HR.hrSystemNumUsers, 'Logged-in users']
      ]
      for (const [oid, descr] of hrDefs) {
        const value = toNumber(hrCounts.value[oid])
        if (value == null) continue
        found.push({
          sensor_class: 'count', sensor_oid: oid, sensor_index: '0',
          description: descr, sensor_group: 'host-resources', unit: '',
          divisor: 1, multiplier: 1, current_value: value,
          entity_ref: null, source: 'host-resources-mib'
        })
      }
    } else {
      record('hrSystemCounts', hrCounts.ok ? 'unsupported' : hrCounts.outcome, hrCounts.ok ? 'no value' : hrCounts.error, hrCounts.durationMs)
    }

    // ── UPS-MIB ──
    const ups = await snmp!.get([UPS.upsEstimatedChargeRemaining, UPS.upsEstimatedMinutesRemaining, UPS.upsBatteryTemperature, UPS.upsBatteryStatus, UPS.upsOutputSource])
    if (ups.ok && toNumber(ups.value[UPS.upsEstimatedChargeRemaining]) != null) {
      record('upsMib', 'success', undefined, ups.durationMs)
      const upsSensors: [string, string, string, string, Record<string, { label: string; severity: string }> | null][] = [
        ['charge', UPS.upsEstimatedChargeRemaining, 'Battery charge remaining', '%', null],
        ['runtime', UPS.upsEstimatedMinutesRemaining, 'Battery runtime remaining', 'min', null],
        ['temperature', UPS.upsBatteryTemperature, 'Battery temperature', '°C', null],
        ['state', UPS.upsBatteryStatus, 'Battery status', '', {
          1: { label: 'unknown', severity: 'warning' }, 2: { label: 'normal', severity: 'ok' },
          3: { label: 'low', severity: 'critical' }, 4: { label: 'depleted', severity: 'critical' }
        } as any],
        ['state', UPS.upsOutputSource, 'Output source', '', {
          1: { label: 'other', severity: 'warning' }, 2: { label: 'none', severity: 'critical' },
          3: { label: 'normal', severity: 'ok' }, 4: { label: 'bypass', severity: 'warning' },
          5: { label: 'battery', severity: 'warning' }, 6: { label: 'booster', severity: 'warning' },
          7: { label: 'reducer', severity: 'warning' }
        } as any]
      ]
      for (const [cls, oid, descr, unit, states] of upsSensors) {
        const value = toNumber(ups.value[oid])
        if (value == null) continue
        found.push({
          sensor_class: cls, sensor_oid: oid, sensor_index: '0',
          description: descr, sensor_group: 'ups', unit,
          divisor: 1, multiplier: 1, current_value: value,
          state_translations: states ? JSON.stringify(states) : null,
          entity_ref: null, source: 'ups-mib'
        })
      }
    } else {
      record('upsMib', ups.ok ? 'unsupported' : ups.outcome, ups.ok ? 'no UPS-MIB' : ups.error, ups.durationMs)
    }

    // ── Printer-MIB supplies (toner/drum levels as percent sensors) ──
    const supplies = await snmp!.table({
      descr: PRINTER.prtMarkerSuppliesDescription,
      level: PRINTER.prtMarkerSuppliesLevel,
      max: PRINTER.prtMarkerSuppliesMaxCapacity
    })
    if (supplies.ok && supplies.value.size) {
      record('prtMarkerSupplies', 'success', `${supplies.value.size} supplies`, supplies.durationMs)
      for (const [index, cols] of supplies.value) {
        const level = toNumber(cols.level)
        const max = toNumber(cols.max)
        const pct = level != null && max != null && max > 0 ? (level / max) * 100 : null
        found.push({
          sensor_class: 'percent',
          sensor_oid: `${PRINTER.prtMarkerSuppliesLevel}.${index}`,
          sensor_index: index,
          description: toStringValue(cols.descr) || `Supply ${index}`,
          sensor_group: 'printer-supplies', unit: '%',
          divisor: max != null && max > 0 ? max / 100 : 1, multiplier: 1,
          current_value: pct,
          entity_ref: null, source: 'printer-mib'
        })
      }
    } else {
      record('prtMarkerSupplies', supplies.ok ? 'empty' : supplies.outcome, supplies.ok ? undefined : supplies.error, supplies.durationMs)
    }

    if (!found.length) return { status: 'unsupported' }
    const rec = await reconcile({
      db, table: 'monitoring.sensors', deviceId: device.id,
      identityColumns: ['sensor_class', 'sensor_oid', 'sensor_index'],
      updateColumns: ['description', 'sensor_group', 'unit', 'divisor', 'multiplier', 'current_value', 'entity_ref'],
      found
    })
    record('sensors-reconcile', 'success', `+${rec.inserted} ~${rec.updated} stale:${rec.markedStale}`)
    return { status: 'success' }
  }
})

/** Physical inventory: the full ENTITY-MIB entPhysicalTable tree. */
defineDiscoveryModule({
  name: 'entity-physical',
  order: 44,
  defaultEnabled: true,
  requiresSnmp: true,
  async run(ctx) {
    const { db, device, snmp, record } = ctx
    const res = await snmp!.table({
      descr: ENTITY.entPhysicalDescr, contained: ENTITY.entPhysicalContainedIn,
      class: ENTITY.entPhysicalClass, name: ENTITY.entPhysicalName,
      hwRev: ENTITY.entPhysicalHardwareRev, fwRev: ENTITY.entPhysicalFirmwareRev,
      swRev: ENTITY.entPhysicalSoftwareRev, serial: ENTITY.entPhysicalSerialNum,
      mfg: ENTITY.entPhysicalMfgName, model: ENTITY.entPhysicalModelName,
      fru: ENTITY.entPhysicalIsFRU
    })
    if (!res.ok) {
      record('entPhysicalTable', res.outcome, res.error, res.durationMs)
      return { status: res.outcome === 'unsupported' ? 'unsupported' : 'failed', error: res.error }
    }
    record('entPhysicalTable', res.value.size ? 'success' : 'empty', `${res.value.size} entities`, res.durationMs)

    const classNames: Record<number, string> = {
      1: 'other', 2: 'unknown', 3: 'chassis', 4: 'backplane', 5: 'container',
      6: 'powerSupply', 7: 'fan', 8: 'sensor', 9: 'module', 10: 'port', 11: 'stack', 12: 'cpu'
    }
    const found: Record<string, unknown>[] = []
    for (const [index, cols] of res.value) {
      if (!/^\d+$/.test(index)) continue
      found.push({
        ent_physical_index: Number(index),
        parent_index: toNumber(cols.contained),
        name: toStringValue(cols.name),
        descr: toStringValue(cols.descr),
        class: classNames[toNumber(cols.class) ?? 0] ?? 'unknown',
        serial: toStringValue(cols.serial) || null,
        model: toStringValue(cols.model) || null,
        manufacturer: toStringValue(cols.mfg) || null,
        hardware_rev: toStringValue(cols.hwRev) || null,
        firmware_rev: toStringValue(cols.fwRev) || null,
        software_rev: toStringValue(cols.swRev) || null,
        is_fru: toNumber(cols.fru) === 1
      })
    }

    // Chassis serial → device serial when not already set
    const chassis = found.find((f) => f.class === 'chassis' && f.serial)
    if (chassis) {
      await db.query(
        `UPDATE monitoring.devices SET serial = COALESCE(serial, $2) WHERE id = $1`,
        [device.id, chassis.serial]
      )
    }

    if (!found.length) return { status: 'empty' }
    const rec = await reconcile({
      db, table: 'monitoring.inventory', deviceId: device.id,
      identityColumns: ['ent_physical_index'],
      updateColumns: ['parent_index', 'name', 'descr', 'class', 'serial', 'model', 'manufacturer', 'hardware_rev', 'firmware_rev', 'software_rev', 'is_fru'],
      found
    })
    record('inventory-reconcile', 'success', `+${rec.inserted} ~${rec.updated} stale:${rec.markedStale}`)
    return { status: 'success' }
  }
})
