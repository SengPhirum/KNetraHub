import { defineDiscoveryModule } from '../../core/registry'
import { reconcile } from '../../core/reconcile'
import { BGP, BGP_PEER_STATES, OSPF, OSPF_NBR_STATES } from '../../snmp/oids'
import { toNumber, toStringValue } from '../../snmp/values'

/** BGP peers (BGP4-MIB bgpPeerTable — every configured peer). */
defineDiscoveryModule({
  name: 'bgp',
  order: 50,
  defaultEnabled: true,
  requiresSnmp: true,
  async run(ctx) {
    const { db, device, snmp, record } = ctx
    const localAsRes = await snmp!.getOne(BGP.bgpLocalAs)
    if (!localAsRes.ok || localAsRes.value?.value == null) {
      record('bgpLocalAs', localAsRes.ok ? 'unsupported' : localAsRes.outcome,
        localAsRes.ok ? 'BGP4-MIB not implemented' : localAsRes.error, localAsRes.durationMs)
      return { status: 'unsupported' }
    }
    record('bgpLocalAs', 'success', undefined, localAsRes.durationMs)
    const localAs = toNumber(localAsRes.value)

    const peers = await snmp!.table({
      identifier: BGP.bgpPeerIdentifier,
      state: BGP.bgpPeerState,
      adminStatus: BGP.bgpPeerAdminStatus,
      remoteAs: BGP.bgpPeerRemoteAs,
      remoteAddr: BGP.bgpPeerRemoteAddr,
      inUpdates: BGP.bgpPeerInUpdates,
      outUpdates: BGP.bgpPeerOutUpdates,
      establishedTime: BGP.bgpPeerFsmEstablishedTime
    })
    if (!peers.ok) {
      record('bgpPeerTable', peers.outcome, peers.error, peers.durationMs)
      return { status: 'failed', error: peers.error }
    }
    record('bgpPeerTable', peers.value.size ? 'success' : 'empty', `${peers.value.size} peers`, peers.durationMs)

    const found: Record<string, unknown>[] = []
    for (const [index, cols] of peers.value) {
      const peerIp = toStringValue(cols.remoteAddr) ?? index
      if (!peerIp || peerIp === '0.0.0.0') continue
      found.push({
        peer_ip: peerIp,
        peer_as: toNumber(cols.remoteAs),
        local_as: localAs,
        peer_identifier: toStringValue(cols.identifier),
        state: BGP_PEER_STATES[toNumber(cols.state) ?? 0] ?? 'unknown',
        admin_status: toNumber(cols.adminStatus) === 2 ? 'start' : 'stop',
        established_seconds: toNumber(cols.establishedTime),
        in_updates: toNumber(cols.inUpdates),
        out_updates: toNumber(cols.outUpdates)
      })
    }

    const rec = await reconcile({
      db, table: 'monitoring.bgp_peers', deviceId: device.id,
      identityColumns: ['peer_ip'],
      updateColumns: ['peer_as', 'local_as', 'peer_identifier', 'state', 'admin_status', 'established_seconds', 'in_updates', 'out_updates'],
      found
    })
    record('bgp-reconcile', 'success', `+${rec.inserted} ~${rec.updated} stale:${rec.markedStale}`)
    return { status: found.length ? 'success' : 'empty' }
  }
})

/** OSPF: general info + neighbor table. */
defineDiscoveryModule({
  name: 'ospf',
  order: 51,
  defaultEnabled: true,
  requiresSnmp: true,
  async run(ctx) {
    const { db, device, snmp, record } = ctx
    const general = await snmp!.get([OSPF.ospfRouterId, OSPF.ospfAdminStat])
    const routerId = general.ok ? toStringValue(general.value[OSPF.ospfRouterId]) : null
    if (!general.ok || !routerId || routerId === '0.0.0.0') {
      record('ospfGeneralGroup', general.ok ? 'unsupported' : general.outcome,
        general.ok ? 'OSPF not enabled' : general.error, general.durationMs)
      return { status: 'unsupported' }
    }
    record('ospfGeneralGroup', 'success', undefined, general.durationMs)

    await reconcile({
      db, table: 'monitoring.ospf_instances', deviceId: device.id,
      identityColumns: ['router_id'],
      updateColumns: ['admin_status'],
      found: [{
        router_id: routerId,
        admin_status: toNumber(general.value[OSPF.ospfAdminStat]) === 1 ? 'enabled' : 'disabled'
      }]
    })

    const nbrs = await snmp!.table({
      ip: OSPF.ospfNbrIpAddr, rtrId: OSPF.ospfNbrRtrId, state: OSPF.ospfNbrState
    })
    if (!nbrs.ok) {
      record('ospfNbrTable', nbrs.outcome, nbrs.error, nbrs.durationMs)
      return { status: 'success' } // instance recorded; neighbors failed
    }
    record('ospfNbrTable', nbrs.value.size ? 'success' : 'empty', `${nbrs.value.size} neighbors`, nbrs.durationMs)

    const found: Record<string, unknown>[] = []
    for (const [, cols] of nbrs.value) {
      const ip = toStringValue(cols.ip)
      if (!ip) continue
      found.push({
        neighbor_ip: ip,
        neighbor_router_id: toStringValue(cols.rtrId),
        state: OSPF_NBR_STATES[toNumber(cols.state) ?? 0] ?? 'unknown'
      })
    }
    const rec = await reconcile({
      db, table: 'monitoring.ospf_neighbors', deviceId: device.id,
      identityColumns: ['neighbor_ip'],
      updateColumns: ['neighbor_router_id', 'state'],
      found
    })
    record('ospf-nbr-reconcile', 'success', `+${rec.inserted} ~${rec.updated} stale:${rec.markedStale}`)
    return { status: 'success' }
  }
})
