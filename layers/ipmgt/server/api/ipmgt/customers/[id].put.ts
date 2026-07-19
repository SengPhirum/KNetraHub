import { getIpamDb as getDb } from '~~/server/utils/moduleDb'
import { requireIpam, ipamAudit, normalizeCustomerStatus } from '~~/layers/ipmgt/server/utils/ipamStore'

export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'operator')
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const db = getDb()
  const cur = await db.query('SELECT * FROM ipmgt_customers WHERE id = $1', [id])
  if (!cur.rows.length) throw createError({ statusCode: 404, statusMessage: 'Customer not found' })
  const row = cur.rows[0]
  const name = body.name !== undefined ? String(body.name).trim() : row.name
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Name is required' })

  await db.query(
    `UPDATE ipmgt_customers SET
       name = $2, address = $3, city = $4, state = $5, postal_code = $6, country = $7,
       contact_person = $8, phone = $9, email = $10, status = $11, notes = $12,
       updated_at = $13, updated_by = $14
     WHERE id = $1`,
    [
      id, name,
      body.address === undefined ? row.address : body.address,
      body.city === undefined ? row.city : body.city,
      body.state === undefined ? row.state : body.state,
      body.postal_code === undefined ? row.postal_code : body.postal_code,
      body.country === undefined ? row.country : body.country,
      body.contact_person === undefined ? row.contact_person : body.contact_person,
      body.phone === undefined ? row.phone : body.phone,
      body.email === undefined ? row.email : body.email,
      body.status === undefined ? row.status : normalizeCustomerStatus(body.status),
      body.notes === undefined ? row.notes : body.notes,
      new Date().toISOString(), user.username
    ]
  )
  await ipamAudit(user, 'ipmgt.customer.update', id, { name })
  return { id }
})
