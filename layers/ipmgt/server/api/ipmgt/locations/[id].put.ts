import { getDb } from '~~/server/utils/db'
import { requireIpam, ipamAudit } from '~~/layers/ipmgt/server/utils/ipamStore'

export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'operator')
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const db = getDb()
  const cur = await db.query('SELECT * FROM ipmgt_locations WHERE id = $1', [id])
  if (!cur.rows.length) throw createError({ statusCode: 404, statusMessage: 'Location not found' })
  const row = cur.rows[0]

  if (body.parent_id && body.parent_id === id) {
    throw createError({ statusCode: 400, statusMessage: 'A location cannot be its own parent' })
  }
  const name = body.name !== undefined ? String(body.name).trim() : row.name
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Name is required' })

  await db.query(
    `UPDATE ipmgt_locations SET
       name = $2, description = $3, address = $4, city = $5, state = $6, postal_code = $7, country = $8,
       latitude = $9, longitude = $10, parent_id = $11, location_type = $12,
       contact_name = $13, contact_email = $14, contact_phone = $15, active = $16,
       updated_at = $17, updated_by = $18
     WHERE id = $1`,
    [
      id, name,
      body.description === undefined ? row.description : body.description,
      body.address === undefined ? row.address : body.address,
      body.city === undefined ? row.city : body.city,
      body.state === undefined ? row.state : body.state,
      body.postal_code === undefined ? row.postal_code : body.postal_code,
      body.country === undefined ? row.country : body.country,
      body.latitude === undefined ? row.latitude : (body.latitude === null || body.latitude === '' ? null : Number(body.latitude)),
      body.longitude === undefined ? row.longitude : (body.longitude === null || body.longitude === '' ? null : Number(body.longitude)),
      body.parent_id === undefined ? row.parent_id : body.parent_id,
      body.location_type === undefined ? row.location_type : body.location_type,
      body.contact_name === undefined ? row.contact_name : body.contact_name,
      body.contact_email === undefined ? row.contact_email : body.contact_email,
      body.contact_phone === undefined ? row.contact_phone : body.contact_phone,
      body.active === undefined ? row.active : !!body.active,
      new Date().toISOString(), user.username
    ]
  )
  await ipamAudit(user, 'ipmgt.location.update', id, { name })
  return { id }
})
