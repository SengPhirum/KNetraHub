import { nanoid } from 'nanoid'
import { getDb } from '~~/server/utils/db'
import { requireIpam, ipamAudit } from '~~/layers/ipmgt/server/utils/ipamStore'

export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'operator')
  const body = await readBody(event)
  const name = String(body?.name || '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  const id = nanoid()
  await getDb().query(
    `INSERT INTO ipmgt_vrfs (id, name, rd, description, owner, location, location_id, customer_id, active, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [id, name, body.rd || null, body.description || null, body.owner || null, body.location || null,
      body.location_id || null, body.customer_id || null,
      body.active === undefined ? true : !!body.active, new Date().toISOString()]
  )
  await ipamAudit(user, 'ipmgt.vrf.create', id, { name })
  return { id }
})
