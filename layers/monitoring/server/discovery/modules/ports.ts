import { defineDiscoveryModule } from '../../core/registry'
import { reconcile } from '../../core/reconcile'
import { IF, IF_ADMIN_STATUS, IF_OPER_STATUS } from '../../snmp/oids'
import { toNumber, toStringValue } from '../../snmp/values'

/**
 * Port discovery: the full IF-MIB interface table (every valid ifIndex —
 * never just a "primary" interface), enriched with ifXTable names/aliases/
 * high-capacity speeds. Sparse tables, string/compound indexes and
 * non-sequential ifIndex values are all preserved by the table walker.
 */
defineDiscoveryModule({
  name: 'ports',
  order: 10,
  defaultEnabled: true,
  requiresSnmp: true,
  async run(ctx) {
    const { db, device, snmp, record } = ctx
    const res = await snmp!.table(
      {
        ifDescr: IF.ifDescr,
        ifType: IF.ifType,
        ifMtu: IF.ifMtu,
        ifSpeed: IF.ifSpeed,
        ifPhysAddress: IF.ifPhysAddress,
        ifAdminStatus: IF.ifAdminStatus,
        ifOperStatus: IF.ifOperStatus,
        ifName: IF.ifName,
        ifAlias: IF.ifAlias,
        ifHighSpeed: IF.ifHighSpeed
      },
      { hints: { ifPhysAddress: 'mac' } }
    )
    if (!res.ok) {
      record('ifTable', res.outcome, res.error, res.durationMs)
      return { status: res.outcome === 'unsupported' ? 'unsupported' : 'failed', error: res.error }
    }
    record('ifTable', res.value.size ? 'success' : 'empty', `${res.value.size} interfaces`, res.durationMs)

    const found = [...res.value.entries()]
      .filter(([index]) => /^\d+$/.test(index))
      .map(([index, cols]) => {
        const highMbps = toNumber(cols.ifHighSpeed)
        const speed = highMbps && highMbps > 0 ? highMbps * 1_000_000 : toNumber(cols.ifSpeed)
        return {
          if_index: Number(index),
          if_name: toStringValue(cols.ifName) ?? toStringValue(cols.ifDescr),
          if_descr: toStringValue(cols.ifDescr),
          if_alias: toStringValue(cols.ifAlias),
          if_type: toStringValue(cols.ifType),
          mac_address: toStringValue(cols.ifPhysAddress) || null,
          mtu: toNumber(cols.ifMtu),
          speed_bps: speed != null ? Math.round(speed) : null,
          admin_status: IF_ADMIN_STATUS[toNumber(cols.ifAdminStatus) ?? 0] ?? null,
          oper_status: IF_OPER_STATUS[toNumber(cols.ifOperStatus) ?? 0] ?? null
        }
      })

    const rec = await reconcile({
      db,
      table: 'monitoring.ports',
      deviceId: device.id,
      identityColumns: ['if_index'],
      updateColumns: ['if_name', 'if_descr', 'if_alias', 'if_type', 'mac_address', 'mtu', 'speed_bps', 'admin_status', 'oper_status'],
      found
    })
    record('ports-reconcile', 'success',
      `+${rec.inserted} ~${rec.updated} =${rec.unchanged} stale:${rec.markedStale}${rec.suspectEmpty ? ' SUSPECT-EMPTY' : ''}`)
    if (rec.suspectEmpty) {
      return { status: 'failed', error: 'interface table unexpectedly empty (previous discovery had rows) — kept existing entities' }
    }
    return { status: found.length ? 'success' : 'empty' }
  }
})
