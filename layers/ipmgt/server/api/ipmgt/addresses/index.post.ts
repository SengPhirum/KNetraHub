import { nanoid } from 'nanoid'
import { getDb } from '~~/server/utils/db'
import {
  requireIpam, ipamAudit, loadSubnet, validateAddressForSubnet, recordIpHistory, normalizeStatus
} from '~~/layers/ipmgt/server/utils/ipamStore'

// Create an address. Validates it belongs to the subnet and isn't a duplicate.
export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'operator')
  const body = await readBody(event)
  if (!body?.subnet_id) throw createError({ statusCode: 400, statusMessage: 'subnet_id is required' })
  if (!body?.ip) throw createError({ statusCode: 400, statusMessage: 'ip is required' })

  const subnet = await loadSubnet(body.subnet_id)
  const canonical = await validateAddressForSubnet(String(body.ip), subnet)
  const status = normalizeStatus(body.status)

  const id = nanoid()
  const now = new Date().toISOString()
  await getDb().query(
    `INSERT INTO ipmgt_ips
      (id, subnet_id, ip, hostname, mac, description, owner, device, status, state,
       dns_name, ptr, nat_to, note, created_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [
      id, body.subnet_id, canonical, body.hostname || null, body.mac || null, body.description || null,
      body.owner || null, body.device || null, status, status,
      body.dns_name || null, body.ptr || null, body.nat_to || null, body.note || null, now, user.username
    ]
  )
  await recordIpHistory({ ipId: id, subnetId: body.subnet_id, ip: canonical, action: 'created', actor: user.username, detail: `status=${status}` })
  await ipamAudit(user, 'ipmgt.ip.create', id, { ip: canonical, subnet: subnet.network })
  return { id, ip: canonical }
})
