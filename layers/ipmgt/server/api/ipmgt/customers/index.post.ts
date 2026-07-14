import { nanoid } from 'nanoid'
import { getDb } from '~~/server/utils/db'
import { requireIpam, ipamAudit, normalizeCustomerStatus } from '~~/layers/ipmgt/server/utils/ipamStore'

export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'operator')
  const body = await readBody(event)
  const name = String(body?.name || '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  const id = nanoid()
  await getDb().query(
    `INSERT INTO ipmgt_customers (
      id, name, address, city, state, postal_code, country,
      contact_person, phone, email, status, notes, created_at, created_by
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      id, name, body.address || null, body.city || null, body.state || null,
      body.postal_code || null, body.country || null,
      body.contact_person || null, body.phone || null, body.email || null,
      normalizeCustomerStatus(body.status), body.notes || null,
      new Date().toISOString(), user.username
    ]
  )
  await ipamAudit(user, 'ipmgt.customer.create', id, { name })
  return { id }
})
