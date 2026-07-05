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
    `INSERT INTO ipmgt_l2domains (id, name, description, location, active, created_at) VALUES ($1,$2,$3,$4,$5,$6)`,
    [id, name, body.description || null, body.location || null, body.active === undefined ? true : !!body.active, new Date().toISOString()]
  )
  await ipamAudit(user, 'ipmgt.l2domain.create', id, { name })
  return { id }
})
