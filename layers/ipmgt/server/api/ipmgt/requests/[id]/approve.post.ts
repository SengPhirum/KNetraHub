import { nanoid } from 'nanoid'
import { getDb } from '~~/server/utils/db'
import { requireIpam, ipamAudit, loadSubnet, recordIpHistory, withSubnetLock } from '~~/layers/ipmgt/server/utils/ipamStore'
import { firstFreeIp, canonicalizeIp, cidrInfo, ipToBigInt, isValidIp } from '~~/layers/ipmgt/server/utils/ipam'

// Approve a request: allocates the requested IP (or the first free one if
// none was specified) and creates the address record, atomically under the
// same per-subnet advisory lock used by first-free reservation - a request
// approval racing an unrelated first-free reservation on the same subnet
// can't collide either.
export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'manager')
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event).catch(() => ({}))
  const db = getDb()

  const cur = await db.query('SELECT * FROM ipmgt_requests WHERE id = $1', [id])
  if (!cur.rows.length) throw createError({ statusCode: 404, statusMessage: 'Request not found' })
  const request = cur.rows[0]
  if (request.status !== 'submitted') {
    throw createError({ statusCode: 409, statusMessage: `Request is already ${request.status}` })
  }
  const subnet = await loadSubnet(request.subnet_id)

  const ipId = nanoid()
  const now = new Date().toISOString()

  const assignedIp = await withSubnetLock(request.subnet_id, async (client) => {
    const { rows } = await client.query('SELECT ip FROM ipmgt_ips WHERE subnet_id = $1', [request.subnet_id])
    const used = new Set<string>()
    for (const r of rows) { try { used.add(canonicalizeIp(r.ip)) } catch { /* skip */ } }
    if (subnet.gateway) { try { used.add(canonicalizeIp(subnet.gateway)) } catch { /* skip */ } }

    let ip: string
    if (request.requested_ip) {
      if (!isValidIp(request.requested_ip)) throw createError({ statusCode: 400, statusMessage: `Requested IP ${request.requested_ip} is not valid` })
      const canon = canonicalizeIp(request.requested_ip)
      const info = cidrInfo(subnet.network)
      const ipInt = ipToBigInt(canon, info.version)
      if (ipInt < info.networkInt || ipInt > info.broadcastInt) {
        throw createError({ statusCode: 400, statusMessage: `${request.requested_ip} is not within subnet ${subnet.network}` })
      }
      if (used.has(canon)) throw createError({ statusCode: 409, statusMessage: `${canon} was taken before this request could be approved - reject or ask the requester to resubmit` })
      ip = canon
    } else {
      const free = firstFreeIp(subnet.network, used)
      if (!free) throw createError({ statusCode: 409, statusMessage: 'No free addresses remain in this subnet' })
      ip = free
    }

    await client.query(
      `INSERT INTO ipmgt_ips (id, subnet_id, ip, hostname, mac, description, owner, status, state, created_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'used','used',$8,$9)`,
      [ipId, request.subnet_id, ip, request.hostname || null, request.mac || null, request.description || null, request.owner || null, now, user.username]
    )
    await client.query(
      `UPDATE ipmgt_requests SET status = 'approved', ip_id = $2, assigned_ip = $3, approver = $4, admin_comment = $5, decided_at = $6, updated_at = $6 WHERE id = $1`,
      [id, ipId, ip, user.username, body?.admin_comment || null, now]
    )
    return ip
  })

  await recordIpHistory({ ipId, subnetId: request.subnet_id, ip: assignedIp, action: 'created', actor: user.username, detail: `request-approved (${id})` })
  await ipamAudit(user, 'ipmgt.request.approve', id, { subnet: subnet.network, ip: assignedIp })
  return { id, ip: assignedIp }
})
