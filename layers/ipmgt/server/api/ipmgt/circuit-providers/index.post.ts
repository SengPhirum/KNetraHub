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
    `INSERT INTO ipmgt_circuit_providers (id, name, contact_name, contact_email, contact_phone, notes, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, name, body.contact_name || null, body.contact_email || null, body.contact_phone || null, body.notes || null, new Date().toISOString()]
  )
  await ipamAudit(user, 'ipmgt.circuit_provider.create', id, { name })
  return { id }
})
