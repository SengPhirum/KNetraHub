import { defineDiscoveryModule } from '../../core/registry'
import { reconcile } from '../../core/reconcile'
import { IPMIB } from '../../snmp/oids'
import { toNumber, toStringValue } from '../../snmp/values'

/** Netmask → prefix length. */
export function maskToPrefix(mask: string | null): number | null {
  if (!mask) return null
  const parts = mask.split('.').map(Number)
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return null
  let bits = 0
  for (const part of parts) bits += ((part >>> 0).toString(2).match(/1/g) ?? []).length
  return bits
}

async function portIdByIfIndex(db: any, deviceId: number): Promise<Map<number, number>> {
  const res = await db.query('SELECT id, if_index FROM monitoring.ports WHERE device_id = $1', [deviceId])
  return new Map(res.rows.map((r: any) => [Number(r.if_index), Number(r.id)]))
}

/** IPv4 addresses from the classic ipAddrTable. */
defineDiscoveryModule({
  name: 'ipv4-addresses',
  order: 20,
  defaultEnabled: true,
  requiresSnmp: true,
  async run(ctx) {
    const { db, device, snmp, record } = ctx
    const res = await snmp!.table({
      addr: IPMIB.ipAdEntAddr,
      ifIndex: IPMIB.ipAdEntIfIndex,
      mask: IPMIB.ipAdEntNetMask
    })
    if (!res.ok) {
      record('ipAddrTable', res.outcome, res.error, res.durationMs)
      return { status: res.outcome === 'unsupported' ? 'unsupported' : 'failed', error: res.error }
    }
    record('ipAddrTable', res.value.size ? 'success' : 'empty', `${res.value.size} addresses`, res.durationMs)

    const ports = await portIdByIfIndex(db, device.id)
    const found: Record<string, unknown>[] = []
    for (const [, cols] of res.value) {
      const address = toStringValue(cols.addr)
      if (!address || !/^\d+\.\d+\.\d+\.\d+$/.test(address)) continue
      const ifIndex = toNumber(cols.ifIndex)
      found.push({
        address,
        prefix_length: maskToPrefix(toStringValue(cols.mask)),
        port_id: ifIndex != null ? ports.get(ifIndex) ?? null : null
      })
    }

    const rec = await reconcile({
      db,
      table: 'monitoring.ipv4_addresses',
      deviceId: device.id,
      identityColumns: ['address'],
      updateColumns: ['prefix_length', 'port_id'],
      found
    })
    record('ipv4-reconcile', 'success', `+${rec.inserted} ~${rec.updated} stale:${rec.markedStale}`)
    return { status: found.length ? 'success' : 'empty' }
  }
})

/** IPv6 (and additional IPv4) addresses from the RFC 4293 ipAddressTable. */
defineDiscoveryModule({
  name: 'ipv6-addresses',
  order: 21,
  defaultEnabled: true,
  requiresSnmp: true,
  async run(ctx) {
    const { db, device, snmp, record } = ctx
    const res = await snmp!.walk(IPMIB.ipAddressIfIndex)
    if (!res.ok) {
      record('ipAddressTable', res.outcome, res.error, res.durationMs)
      return { status: res.outcome === 'unsupported' ? 'unsupported' : 'failed', error: res.error }
    }

    const ports = await portIdByIfIndex(db, device.id)
    const found: Record<string, unknown>[] = []
    for (const row of res.value) {
      // Index: ipAddressAddrType(1=v4,2=v6).length.bytes…
      const parts = row.index.split('.').map(Number)
      const addrType = parts[0]
      const len = parts[1]
      if (addrType !== 2 || len !== 16 || parts.length < 2 + 16) continue
      const bytes = parts.slice(2, 18)
      const groups: string[] = []
      for (let i = 0; i < 16; i += 2) groups.push(((bytes[i]! << 8) | bytes[i + 1]!).toString(16))
      const address = groups.join(':')
      if (address === '0:0:0:0:0:0:0:0') continue
      const ifIndex = toNumber(row.value)
      found.push({
        address,
        prefix_length: null,
        origin: null,
        port_id: ifIndex != null ? ports.get(ifIndex) ?? null : null
      })
    }
    record('ipAddressTable', found.length ? 'success' : 'empty', `${found.length} ipv6 addresses`, res.durationMs)

    const rec = await reconcile({
      db,
      table: 'monitoring.ipv6_addresses',
      deviceId: device.id,
      identityColumns: ['address'],
      updateColumns: ['prefix_length', 'port_id'],
      found
    })
    record('ipv6-reconcile', 'success', `+${rec.inserted} ~${rec.updated} stale:${rec.markedStale}`)
    return { status: found.length ? 'success' : 'empty' }
  }
})

/** ARP table (ipNetToMediaTable). */
defineDiscoveryModule({
  name: 'arp-table',
  order: 22,
  defaultEnabled: true,
  requiresSnmp: true,
  async run(ctx) {
    const { db, device, snmp, record } = ctx
    const res = await snmp!.table(
      { ifIndex: IPMIB.ipNetToMediaIfIndex, mac: IPMIB.ipNetToMediaPhysAddress, ip: IPMIB.ipNetToMediaNetAddress },
      { hints: { mac: 'mac' } }
    )
    if (!res.ok) {
      record('ipNetToMediaTable', res.outcome, res.error, res.durationMs)
      return { status: res.outcome === 'unsupported' ? 'unsupported' : 'failed', error: res.error }
    }
    record('ipNetToMediaTable', res.value.size ? 'success' : 'empty', `${res.value.size} entries`, res.durationMs)

    const ports = await portIdByIfIndex(db, device.id)
    const found: Record<string, unknown>[] = []
    const seen = new Set<string>()
    for (const [, cols] of res.value) {
      const ip = toStringValue(cols.ip)
      const mac = toStringValue(cols.mac)
      if (!ip || !mac || mac === '00:00:00:00:00:00') continue
      const key = `${ip} ${mac}`
      if (seen.has(key)) continue
      seen.add(key)
      const ifIndex = toNumber(cols.ifIndex)
      found.push({ ip, mac_address: mac, port_id: ifIndex != null ? ports.get(ifIndex) ?? null : null })
    }

    const rec = await reconcile({
      db,
      table: 'monitoring.arp_entries',
      deviceId: device.id,
      identityColumns: ['ip', 'mac_address'],
      updateColumns: ['port_id'],
      found
    })
    record('arp-reconcile', 'success', `+${rec.inserted} ~${rec.updated} stale:${rec.markedStale}`)
    return { status: found.length ? 'success' : 'empty' }
  }
})
