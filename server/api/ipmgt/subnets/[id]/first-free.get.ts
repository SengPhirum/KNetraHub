import { getDb } from '../../../../utils/db'
import { requireIpam, loadSubnet } from '../../../../utils/ipamStore'
import { firstFreeIp, canonicalizeIp } from '../../../../utils/ipam'

// Find (without reserving) the first free address in a subnet.
export default defineEventHandler(async (event) => {
  await requireIpam(event, 'viewer')
  const id = getRouterParam(event, 'id')!
  const subnet = await loadSubnet(id)

  const { rows } = await getDb().query('SELECT ip FROM ipmgt_ips WHERE subnet_id = $1', [id])
  const used = new Set<string>()
  for (const r of rows) { try { used.add(canonicalizeIp(r.ip)) } catch { /* skip */ } }
  if (subnet.gateway) { try { used.add(canonicalizeIp(subnet.gateway)) } catch { /* skip */ } }

  const ip = firstFreeIp(subnet.network, used)
  if (!ip) throw createError({ statusCode: 409, statusMessage: 'No free addresses available in this subnet' })
  return { ip, subnetId: id }
})
