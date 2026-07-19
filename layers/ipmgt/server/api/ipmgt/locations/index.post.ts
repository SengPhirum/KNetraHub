import { nanoid } from 'nanoid'
import { getIpamDb as getDb } from '~~/server/utils/moduleDb'
import { requireIpam, ipamAudit } from '~~/layers/ipmgt/server/utils/ipamStore'

export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'operator')
  const body = await readBody(event)
  const name = String(body?.name || '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  const id = nanoid()
  await getDb().query(
    `INSERT INTO ipmgt_locations (
      id, name, description, address, city, state, postal_code, country,
      latitude, longitude, parent_id, location_type,
      contact_name, contact_email, contact_phone, active, created_at, created_by
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
    [
      id, name, body.description || null, body.address || null, body.city || null,
      body.state || null, body.postal_code || null, body.country || null,
      body.latitude === undefined || body.latitude === null || body.latitude === '' ? null : Number(body.latitude),
      body.longitude === undefined || body.longitude === null || body.longitude === '' ? null : Number(body.longitude),
      body.parent_id || null, body.location_type || null,
      body.contact_name || null, body.contact_email || null, body.contact_phone || null,
      body.active === undefined ? true : !!body.active,
      new Date().toISOString(), user.username
    ]
  )
  await ipamAudit(user, 'ipmgt.location.create', id, { name })
  return { id }
})
