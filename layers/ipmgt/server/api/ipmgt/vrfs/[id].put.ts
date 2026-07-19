import { getIpamDb as getDb } from '~~/server/utils/moduleDb'
import { requireIpam, ipamAudit } from '~~/layers/ipmgt/server/utils/ipamStore'

export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'operator')
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const db = getDb()
  const cur = await db.query('SELECT * FROM ipmgt_vrfs WHERE id = $1', [id])
  if (!cur.rows.length) throw createError({ statusCode: 404, statusMessage: 'VRF not found' })
  const row = cur.rows[0]
  await db.query(
    `UPDATE ipmgt_vrfs SET name = $2, rd = $3, description = $4, owner = $5, location = $6,
       location_id = $7, customer_id = $8, active = $9, updated_at = $10 WHERE id = $1`,
    [
      id,
      body.name === undefined ? row.name : String(body.name).trim(),
      body.rd === undefined ? row.rd : body.rd,
      body.description === undefined ? row.description : body.description,
      body.owner === undefined ? row.owner : body.owner,
      body.location === undefined ? row.location : body.location,
      body.location_id === undefined ? row.location_id : (body.location_id || null),
      body.customer_id === undefined ? row.customer_id : (body.customer_id || null),
      body.active === undefined ? row.active : !!body.active,
      new Date().toISOString()
    ]
  )
  await ipamAudit(user, 'ipmgt.vrf.update', id, { name: row.name })
  return { id }
})
