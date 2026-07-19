import { getIpamDb as getDb } from '~~/server/utils/moduleDb'
import { requireIpam, ipamAudit } from '~~/layers/ipmgt/server/utils/ipamStore'

export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'operator')
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const db = getDb()

  const cur = await db.query('SELECT * FROM ipmgt_vlans WHERE id = $1', [id])
  if (!cur.rows.length) throw createError({ statusCode: 404, statusMessage: 'VLAN not found' })
  const row = cur.rows[0]

  const vlanId = body.vlan_id === undefined ? row.vlan_id : Number(body.vlan_id)
  if (!Number.isInteger(vlanId) || vlanId < 1 || vlanId > 4094) {
    throw createError({ statusCode: 400, statusMessage: 'VLAN id must be between 1 and 4094' })
  }
  const l2 = body.l2domain_id === undefined ? row.l2domain_id : (body.l2domain_id || null)
  const dup = await db.query(
    'SELECT 1 FROM ipmgt_vlans WHERE vlan_id = $1 AND coalesce(l2domain_id, \'\') = coalesce($2, \'\') AND id <> $3',
    [vlanId, l2, id]
  )
  if (dup.rows.length) throw createError({ statusCode: 409, statusMessage: `VLAN ${vlanId} already exists in this L2 domain` })

  await db.query(
    `UPDATE ipmgt_vlans SET vlan_id = $2, name = $3, description = $4, l2domain_id = $5, location = $6,
       location_id = $7, customer_id = $8, active = $9, updated_at = $10 WHERE id = $1`,
    [
      id, vlanId,
      body.name === undefined ? row.name : String(body.name).trim(),
      body.description === undefined ? row.description : body.description,
      l2,
      body.location === undefined ? row.location : body.location,
      body.location_id === undefined ? row.location_id : (body.location_id || null),
      body.customer_id === undefined ? row.customer_id : (body.customer_id || null),
      body.active === undefined ? row.active : !!body.active,
      new Date().toISOString()
    ]
  )
  await ipamAudit(user, 'ipmgt.vlan.update', id, { vlan_id: vlanId })
  return { id }
})
