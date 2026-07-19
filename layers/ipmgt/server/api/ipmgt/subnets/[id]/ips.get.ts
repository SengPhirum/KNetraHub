import { getIpamDb as getDb } from '~~/server/utils/moduleDb'
import { requireIpam, loadSubnet } from '~~/layers/ipmgt/server/utils/ipamStore'
import { enumerateHosts, canonicalizeIp, MAX_GRID_HOSTS } from '~~/layers/ipmgt/server/utils/ipam'

// Visual subnet grid: enumerate host cells (capped) and merge in the defined
// addresses from ipmgt_ips so each cell carries a status + linked record.
export default defineEventHandler(async (event) => {
  await requireIpam(event, 'viewer')
  const id = getRouterParam(event, 'id')!
  const subnet = await loadSubnet(id)

  const { rows } = await getDb().query('SELECT * FROM ipmgt_ips WHERE subnet_id = $1', [id])
  const byIp = new Map<string, any>()
  for (const r of rows) {
    try { byIp.set(canonicalizeIp(r.ip), r) } catch { /* skip malformed */ }
  }

  const { cells, truncated, total } = enumerateHosts(subnet.network, subnet.gateway, MAX_GRID_HOSTS)
  const grid = cells.map((c) => {
    const rec = byIp.get(canonicalizeIp(c.ip))
    const status = rec ? (rec.status || String(rec.state || 'used').toLowerCase()) : (c.isGateway ? 'gateway' : 'free')
    return {
      ip: c.ip,
      offset: c.offset,
      isNetwork: c.isNetwork,
      isBroadcast: c.isBroadcast,
      isGateway: c.isGateway,
      status,
      record: rec
        ? { id: rec.id, hostname: rec.hostname, description: rec.description, owner: rec.owner, mac: rec.mac, device: rec.device }
        : null
    }
  })

  return { subnetId: id, network: subnet.network, gateway: subnet.gateway, total, truncated, gridLimit: MAX_GRID_HOSTS, cells: grid }
})
