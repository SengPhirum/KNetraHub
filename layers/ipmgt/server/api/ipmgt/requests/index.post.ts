import { nanoid } from 'nanoid'
import { getIpamDb as getDb } from '~~/server/utils/moduleDb'
import { requireIpam, ipamAudit, loadSubnet } from '~~/layers/ipmgt/server/utils/ipamStore'
import { isValidIp } from '~~/layers/ipmgt/server/utils/ipam'

// Submit an IP request against a subnet that allows requests. The requested
// IP (if any) is stored as-is and only validated/allocated at approval time -
// keeping submission cheap and avoiding a stale reservation if the subnet
// changes before a manager reviews it.
export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'operator')
  const body = await readBody(event)
  const subnetId = String(body?.subnet_id || '')
  if (!subnetId) throw createError({ statusCode: 400, statusMessage: 'subnet_id is required' })
  const subnet = await loadSubnet(subnetId)
  if (!subnet.allow_requests) {
    throw createError({ statusCode: 403, statusMessage: `Subnet ${subnet.network} does not accept requests` })
  }
  if (body.requested_ip && !isValidIp(String(body.requested_ip))) {
    throw createError({ statusCode: 400, statusMessage: `Invalid requested IP: ${body.requested_ip}` })
  }

  const id = nanoid()
  const now = new Date().toISOString()
  await getDb().query(
    `INSERT INTO ipmgt_requests (
      id, subnet_id, requested_ip, hostname, mac, owner, description, justification,
      status, requester, created_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'submitted',$9,$10)`,
    [
      id, subnetId, body.requested_ip || null, body.hostname || null, body.mac || null,
      body.owner || null, body.description || null, body.justification || null,
      user.username, now
    ]
  )
  await ipamAudit(user, 'ipmgt.request.submit', id, { subnet: subnet.network, requested_ip: body.requested_ip || null })
  return { id }
})
