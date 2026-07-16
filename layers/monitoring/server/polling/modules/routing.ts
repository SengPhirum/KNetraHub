import { definePollerModule } from '../../core/registry'
import { BGP, BGP_PEER_STATES, OSPF, OSPF_NBR_STATES } from '../../snmp/oids'
import { toNumber, toStringValue } from '../../snmp/values'
import { recordEvent } from '../../core/events'

/** BGP peer polling: session state + update counters, events on transitions. */
definePollerModule({
  name: 'bgp',
  order: 30,
  defaultEnabled: true,
  requiresSnmp: true,
  async run(ctx) {
    const { db, device, snmp, record } = ctx
    const peers = await db.query(
      `SELECT id, peer_ip, state FROM monitoring.bgp_peers WHERE device_id = $1 AND stale_since IS NULL`,
      [device.id]
    )
    if (!peers.rows.length) {
      record('bgp', 'skipped', 'no discovered peers')
      return { status: 'empty' }
    }
    const res = await snmp!.table({
      state: BGP.bgpPeerState,
      remoteAddr: BGP.bgpPeerRemoteAddr,
      inUpdates: BGP.bgpPeerInUpdates,
      outUpdates: BGP.bgpPeerOutUpdates,
      establishedTime: BGP.bgpPeerFsmEstablishedTime
    })
    if (!res.ok) {
      record('bgpPeerTable', res.outcome, res.error, res.durationMs)
      return { status: 'failed', error: res.error }
    }
    record('bgpPeerTable', 'success', `${res.value.size} rows`, res.durationMs)

    // Index of bgpPeerTable is the peer IP.
    const byIp = new Map<string, Record<string, any>>()
    for (const [index, cols] of res.value) {
      byIp.set(toStringValue(cols.remoteAddr) ?? index, cols)
    }

    const now = new Date()
    let ok = 0
    for (const peer of peers.rows) {
      const cols = byIp.get(String(peer.peer_ip).replace(/\/32$/, ''))
      if (!cols) {
        record(`bgp.${peer.peer_ip}`, 'failed', 'peer missing from walk')
        continue
      }
      const state = BGP_PEER_STATES[toNumber(cols.state) ?? 0] ?? 'unknown'
      const established = toNumber(cols.establishedTime)
      if (state !== peer.state) {
        await recordEvent(db, {
          deviceId: device.id, entityType: 'bgp_peer', entityId: Number(peer.id),
          eventType: state === 'established' ? 'bgp_established' : 'bgp_down',
          severity: state === 'established' ? 'info' : 'error',
          message: `BGP peer ${peer.peer_ip}: ${peer.state} → ${state}`
        })
      }
      await db.query(
        `UPDATE monitoring.bgp_peers SET state = $2, established_seconds = $3,
           in_updates = $4, out_updates = $5, polled_at = now(), updated_at = now() WHERE id = $1`,
        [peer.id, state, established, toNumber(cols.inUpdates), toNumber(cols.outUpdates)]
      )
      await db.query(
        `INSERT INTO monitoring.metrics (time, device_id, metric, entity_type, entity_id, value)
         VALUES ($1,$2,'bgp_established','bgp_peer',$3,$4), ($1,$2,'bgp_established_seconds','bgp_peer',$3,$5)`,
        [now, device.id, peer.id, state === 'established' ? 1 : 0, established]
      )
      record(`bgp.${peer.peer_ip}`, 'success')
      ok++
    }
    return { status: ok ? 'success' : 'failed', error: ok ? undefined : 'no peers collected' }
  }
})

/** OSPF neighbor polling: adjacency states with events on transitions. */
definePollerModule({
  name: 'ospf',
  order: 31,
  defaultEnabled: true,
  requiresSnmp: true,
  async run(ctx) {
    const { db, device, snmp, record } = ctx
    const nbrs = await db.query(
      `SELECT id, neighbor_ip, state FROM monitoring.ospf_neighbors WHERE device_id = $1 AND stale_since IS NULL`,
      [device.id]
    )
    if (!nbrs.rows.length) {
      record('ospf', 'skipped', 'no discovered neighbors')
      return { status: 'empty' }
    }
    const res = await snmp!.table({ ip: OSPF.ospfNbrIpAddr, state: OSPF.ospfNbrState })
    if (!res.ok) {
      record('ospfNbrTable', res.outcome, res.error, res.durationMs)
      return { status: 'failed', error: res.error }
    }
    record('ospfNbrTable', 'success', `${res.value.size} rows`, res.durationMs)

    const stateByIp = new Map<string, string>()
    for (const [, cols] of res.value) {
      const ip = toStringValue(cols.ip)
      if (ip) stateByIp.set(ip, OSPF_NBR_STATES[toNumber(cols.state) ?? 0] ?? 'unknown')
    }

    let ok = 0
    for (const nbr of nbrs.rows) {
      const state = stateByIp.get(String(nbr.neighbor_ip).replace(/\/32$/, ''))
      if (!state) {
        record(`ospf.${nbr.neighbor_ip}`, 'failed', 'neighbor missing from walk')
        continue
      }
      if (state !== nbr.state) {
        await recordEvent(db, {
          deviceId: device.id, entityType: 'device', entityId: Number(nbr.id),
          eventType: state === 'full' ? 'ospf_full' : 'ospf_down',
          severity: state === 'full' ? 'info' : 'warning',
          message: `OSPF neighbor ${nbr.neighbor_ip}: ${nbr.state} → ${state}`
        })
      }
      await db.query(
        `UPDATE monitoring.ospf_neighbors SET state = $2, polled_at = now(), updated_at = now() WHERE id = $1`,
        [nbr.id, state]
      )
      record(`ospf.${nbr.neighbor_ip}`, 'success')
      ok++
    }
    return { status: ok ? 'success' : 'failed', error: ok ? undefined : 'no neighbors collected' }
  }
})
