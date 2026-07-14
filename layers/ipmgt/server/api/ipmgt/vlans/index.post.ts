import { nanoid } from 'nanoid'
import { getDb } from '~~/server/utils/db'
import { requireIpam, ipamAudit } from '~~/layers/ipmgt/server/utils/ipamStore'

// Create a VLAN. VLAN id must be 1-4094 and unique within its L2 domain (the
// same id may repeat across different domains).
export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'operator')
  const body = await readBody(event)
  const vlanId = Number(body?.vlan_id)
  if (!Number.isInteger(vlanId) || vlanId < 1 || vlanId > 4094) {
    throw createError({ statusCode: 400, statusMessage: 'VLAN id must be between 1 and 4094' })
  }
  const name = String(body?.name || '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  const db = getDb()

  const dup = await db.query(
    'SELECT 1 FROM ipmgt_vlans WHERE vlan_id = $1 AND coalesce(l2domain_id, \'\') = coalesce($2, \'\')',
    [vlanId, body.l2domain_id || null]
  )
  if (dup.rows.length) throw createError({ statusCode: 409, statusMessage: `VLAN ${vlanId} already exists in this L2 domain` })

  const id = nanoid()
  await db.query(
    `INSERT INTO ipmgt_vlans (id, vlan_id, name, description, l2domain_id, location, location_id, customer_id, active, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [id, vlanId, name, body.description || null, body.l2domain_id || null, body.location || null,
      body.location_id || null, body.customer_id || null,
      body.active === undefined ? true : !!body.active, new Date().toISOString()]
  )
  await ipamAudit(user, 'ipmgt.vlan.create', id, { vlan_id: vlanId, name })
  return { id }
})
