import { defineDiscoveryModule } from '../../core/registry'
import { reconcile } from '../../core/reconcile'
import { BRIDGE, LLDP, CDP } from '../../snmp/oids'
import { toNumber, toStringValue } from '../../snmp/values'

async function bridgePortToIfIndex(snmp: any): Promise<Map<number, number>> {
  const res = await snmp.walk(BRIDGE.dot1dBasePortIfIndex)
  const map = new Map<number, number>()
  if (res.ok) {
    for (const row of res.value) {
      const ifIndex = toNumber(row.value)
      if (ifIndex != null) map.set(Number(row.index), ifIndex)
    }
  }
  return map
}

async function portIdByIfIndex(db: any, deviceId: number): Promise<Map<number, number>> {
  const res = await db.query('SELECT id, if_index FROM monitoring.ports WHERE device_id = $1', [deviceId])
  return new Map(res.rows.map((r: any) => [Number(r.if_index), Number(r.id)]))
}

/** VLAN inventory (Q-BRIDGE dot1qVlanStaticTable). */
defineDiscoveryModule({
  name: 'vlans',
  order: 30,
  defaultEnabled: true,
  requiresSnmp: true,
  async run(ctx) {
    const { db, device, snmp, record } = ctx
    const res = await snmp!.walk(BRIDGE.dot1qVlanStaticName)
    if (!res.ok) {
      record('dot1qVlanStaticTable', res.outcome, res.error, res.durationMs)
      return { status: res.outcome === 'unsupported' ? 'unsupported' : 'failed', error: res.error }
    }
    record('dot1qVlanStaticTable', res.value.length ? 'success' : 'empty', `${res.value.length} vlans`, res.durationMs)

    const found = res.value
      .filter((row) => /^\d+$/.test(row.index))
      .map((row) => ({ vlan_id: Number(row.index), name: toStringValue(row.value), state: 'active' }))

    const rec = await reconcile({
      db, table: 'monitoring.vlans', deviceId: device.id,
      identityColumns: ['vlan_id'], updateColumns: ['name', 'state'], found
    })
    record('vlans-reconcile', 'success', `+${rec.inserted} ~${rec.updated} stale:${rec.markedStale}`)
    return { status: found.length ? 'success' : 'empty' }
  }
})

/** Forwarding database (BRIDGE-MIB dot1dTpFdbTable; MAC index preserved). */
defineDiscoveryModule({
  name: 'fdb-table',
  order: 31,
  defaultEnabled: true,
  requiresSnmp: true,
  async run(ctx) {
    const { db, device, snmp, record } = ctx
    const res = await snmp!.walk(BRIDGE.dot1dTpFdbPort)
    if (!res.ok) {
      record('dot1dTpFdbTable', res.outcome, res.error, res.durationMs)
      return { status: res.outcome === 'unsupported' ? 'unsupported' : 'failed', error: res.error }
    }
    record('dot1dTpFdbTable', res.value.length ? 'success' : 'empty', `${res.value.length} entries`, res.durationMs)

    const bridgeMap = await bridgePortToIfIndex(snmp)
    const ports = await portIdByIfIndex(db, device.id)
    const found: Record<string, unknown>[] = []
    const seen = new Set<string>()
    for (const row of res.value) {
      // Index is the MAC as 6 decimal octets.
      const octets = row.index.split('.').map(Number)
      if (octets.length !== 6 || octets.some((o) => Number.isNaN(o) || o > 255)) continue
      const mac = octets.map((o) => o.toString(16).padStart(2, '0')).join(':')
      if (seen.has(mac)) continue
      seen.add(mac)
      const bridgePort = toNumber(row.value)
      const ifIndex = bridgePort != null ? bridgeMap.get(bridgePort) : undefined
      found.push({
        mac_address: mac,
        vlan_id: null,
        port_id: ifIndex != null ? ports.get(ifIndex) ?? null : null
      })
    }

    const rec = await reconcile({
      db, table: 'monitoring.fdb_entries', deviceId: device.id,
      identityColumns: ['mac_address'], updateColumns: ['port_id', 'vlan_id'], found
    })
    record('fdb-reconcile', 'success', `+${rec.inserted} ~${rec.updated} stale:${rec.markedStale}`)
    return { status: found.length ? 'success' : 'empty' }
  }
})

/** Spanning tree (dot1dStp scalars). */
defineDiscoveryModule({
  name: 'stp',
  order: 32,
  defaultEnabled: true,
  requiresSnmp: true,
  async run(ctx) {
    const { db, device, snmp, record } = ctx
    const res = await snmp!.get([
      BRIDGE.dot1dBaseBridgeAddress, BRIDGE.dot1dStpPriority,
      BRIDGE.dot1dStpDesignatedRoot, BRIDGE.dot1dStpRootCost
    ])
    if (!res.ok) {
      record('dot1dStp', res.outcome, res.error, res.durationMs)
      return { status: res.outcome === 'unsupported' ? 'unsupported' : 'failed', error: res.error }
    }
    const bridgeAddr = res.value[BRIDGE.dot1dBaseBridgeAddress]
    if (!bridgeAddr?.value) {
      record('dot1dStp', 'unsupported', 'no bridge address')
      return { status: 'unsupported' }
    }
    record('dot1dStp', 'success', undefined, res.durationMs)

    const bridge = String(bridgeAddr.rawHex ?? bridgeAddr.value)
    const rootRaw = res.value[BRIDGE.dot1dStpDesignatedRoot]
    const root = rootRaw?.rawHex ?? (rootRaw?.value != null ? String(rootRaw.value) : null)
    // designated root = 2-byte priority + 6-byte bridge MAC
    const rootMac = root && root.length >= 16 ? String(root).slice(4) : null
    const found = [{
      protocol: 'ieee8021d',
      bridge_address: bridge,
      priority: toNumber(res.value[BRIDGE.dot1dStpPriority]),
      root_bridge: rootMac,
      root_cost: toNumber(res.value[BRIDGE.dot1dStpRootCost]),
      is_root: rootMac != null && bridge.endsWith(rootMac.slice(-12))
    }]

    const rec = await reconcile({
      db, table: 'monitoring.stp_instances', deviceId: device.id,
      identityColumns: ['bridge_address'],
      updateColumns: ['protocol', 'priority', 'root_bridge', 'root_cost', 'is_root'],
      found
    })
    record('stp-reconcile', 'success', `+${rec.inserted} ~${rec.updated}`)
    return { status: 'success' }
  }
})

/** Discovery protocols: LLDP + CDP neighbor tables → topology links. */
defineDiscoveryModule({
  name: 'discovery-protocols',
  order: 33,
  defaultEnabled: true,
  requiresSnmp: true,
  async run(ctx) {
    const { db, device, snmp, record } = ctx
    const ports = await portIdByIfIndex(db, device.id)
    const found: Record<string, unknown>[] = []

    const lldp = await snmp!.table({
      sysName: LLDP.lldpRemSysName,
      portId: LLDP.lldpRemPortId,
      portDesc: LLDP.lldpRemPortDesc,
      sysDesc: LLDP.lldpRemSysDesc
    })
    if (lldp.ok) {
      record('lldpRemTable', lldp.value.size ? 'success' : 'empty', `${lldp.value.size} neighbors`, lldp.durationMs)
      for (const [index, cols] of lldp.value) {
        // index = timeMark.localPortNum.remIndex; localPortNum usually == ifIndex
        const localPort = Number(index.split('.')[1])
        found.push({
          protocol: 'lldp',
          port_id: ports.get(localPort) ?? null,
          remote_hostname: toStringValue(cols.sysName),
          remote_port: toStringValue(cols.portDesc) ?? toStringValue(cols.portId),
          remote_platform: toStringValue(cols.sysDesc)?.slice(0, 250) ?? null,
          remote_address: null
        })
      }
    } else {
      record('lldpRemTable', lldp.outcome, lldp.error, lldp.durationMs)
    }

    const cdp = await snmp!.table({
      deviceId: CDP.cdpCacheDeviceId,
      devicePort: CDP.cdpCacheDevicePort,
      platform: CDP.cdpCachePlatform
    })
    if (cdp.ok) {
      record('cdpCacheTable', cdp.value.size ? 'success' : 'empty', `${cdp.value.size} neighbors`, cdp.durationMs)
      for (const [index, cols] of cdp.value) {
        const localIfIndex = Number(index.split('.')[0])
        found.push({
          protocol: 'cdp',
          port_id: ports.get(localIfIndex) ?? null,
          remote_hostname: toStringValue(cols.deviceId),
          remote_port: toStringValue(cols.devicePort),
          remote_platform: toStringValue(cols.platform)?.slice(0, 250) ?? null,
          remote_address: null
        })
      }
    } else {
      record('cdpCacheTable', cdp.outcome, cdp.error, cdp.durationMs)
    }

    if (!lldp.ok && !cdp.ok) return { status: 'unsupported', error: 'neither LLDP nor CDP responded' }

    // Cross-link neighbors to known devices by hostname/sysName.
    for (const link of found) {
      if (!link.remote_hostname) continue
      const match = await db.query(
        `SELECT id FROM monitoring.devices WHERE lower(hostname) = lower($1) OR lower(sys_name) = lower($1) LIMIT 1`,
        [String(link.remote_hostname).split('.')[0]]
      )
      link.remote_device_id = match.rows[0]?.id ?? null
    }

    const rec = await reconcile({
      db, table: 'monitoring.topology_links', deviceId: device.id,
      identityColumns: ['protocol', 'port_id', 'remote_hostname', 'remote_port'],
      updateColumns: ['remote_platform', 'remote_address', 'remote_device_id'],
      found
    })
    record('topology-reconcile', 'success', `+${rec.inserted} ~${rec.updated} stale:${rec.markedStale}`)
    return { status: found.length ? 'success' : 'empty' }
  }
})
