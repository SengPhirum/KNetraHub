import { getDb } from '~~/server/utils/db'
import {
  requireIpam, ipamAudit, loadSubnet, validateAddressForSubnet, recordIpHistory, normalizeStatus
} from '~~/layers/ipmgt/server/utils/ipamStore'

// Update an address (edit / release / change status). If the IP changes it is
// re-validated against the subnet. A status transition is recorded in history.
export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'operator')
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const db = getDb()

  const curRes = await db.query('SELECT * FROM ipmgt_ips WHERE id = $1', [id])
  if (!curRes.rows.length) throw createError({ statusCode: 404, statusMessage: 'Address not found' })
  const cur = curRes.rows[0]
  const subnet = await loadSubnet(cur.subnet_id)

  let ip = cur.ip
  if (body.ip !== undefined && String(body.ip).trim() && String(body.ip).trim() !== cur.ip) {
    ip = await validateAddressForSubnet(String(body.ip), subnet, id)
  }
  const g = (k: string, d: any) => (body[k] === undefined ? d : body[k])
  const prevStatus = cur.status || String(cur.state || 'used').toLowerCase()
  const status = body.status === undefined ? prevStatus : normalizeStatus(body.status)

  await db.query(
    `UPDATE ipmgt_ips SET
       ip = $2, hostname = $3, mac = $4, description = $5, owner = $6, device = $7,
       status = $8, state = $9, dns_name = $10, ptr = $11, nat_to = $12, note = $13,
       updated_at = $14, updated_by = $15
     WHERE id = $1`,
    [
      id, ip, g('hostname', cur.hostname), g('mac', cur.mac), g('description', cur.description),
      g('owner', cur.owner), g('device', cur.device), status, status,
      g('dns_name', cur.dns_name), g('ptr', cur.ptr), g('nat_to', cur.nat_to), g('note', cur.note),
      new Date().toISOString(), user.username
    ]
  )
  const action = status !== prevStatus ? 'status-changed' : 'updated'
  await recordIpHistory({ ipId: id, subnetId: cur.subnet_id, ip, action, actor: user.username, detail: status !== prevStatus ? `${prevStatus} → ${status}` : undefined })
  await ipamAudit(user, 'ipmgt.ip.update', id, { ip, status })
  return { id, ip, status }
})
