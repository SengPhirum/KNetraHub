import { nanoid } from 'nanoid'
import { getDb } from '../../../../utils/db'
import { requireIpam, ipamAudit, loadSubnet, recordIpHistory, normalizeStatus } from '../../../../utils/ipamStore'
import { firstFreeIp, canonicalizeIp } from '../../../../utils/ipam'

// Reserve/assign the first free address in a subnet in one step. Body may carry
// hostname/description/owner/status (default 'reserved').
export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'operator')
  const id = getRouterParam(event, 'id')!
  const subnet = await loadSubnet(id)
  const body = await readBody(event).catch(() => ({}))
  const db = getDb()

  const { rows } = await db.query('SELECT ip FROM ipmgt_ips WHERE subnet_id = $1', [id])
  const used = new Set<string>()
  for (const r of rows) { try { used.add(canonicalizeIp(r.ip)) } catch { /* skip */ } }
  if (subnet.gateway) { try { used.add(canonicalizeIp(subnet.gateway)) } catch { /* skip */ } }

  const ip = firstFreeIp(subnet.network, used)
  if (!ip) throw createError({ statusCode: 409, statusMessage: 'No free addresses available in this subnet' })

  const status = normalizeStatus(body?.status || 'reserved')
  const ipId = nanoid()
  const now = new Date().toISOString()
  await db.query(
    `INSERT INTO ipmgt_ips (id, subnet_id, ip, hostname, mac, description, owner, device, status, state, created_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [ipId, id, ip, body?.hostname || null, body?.mac || null, body?.description || null, body?.owner || null, body?.device || null, status, status, now, user.username]
  )
  await recordIpHistory({ ipId, subnetId: id, ip, action: 'created', actor: user.username, detail: `reserve-first-free (${status})` })
  await ipamAudit(user, 'ipmgt.ip.reserve', ipId, { ip, subnet: subnet.network })
  return { id: ipId, ip, status }
})
