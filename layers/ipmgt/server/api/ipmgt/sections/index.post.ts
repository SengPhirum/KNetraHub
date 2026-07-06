import { nanoid } from 'nanoid'
import { getDb } from '~~/server/utils/db'
import { requireIpam, ipamAudit } from '~~/layers/ipmgt/server/utils/ipamStore'

// Create a section (department/environment/branch/zone/tenant grouping).
export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'operator')
  const body = await readBody(event)
  const name = String(body?.name || '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Name is required' })

  const id = nanoid()
  const now = new Date().toISOString()
  await getDb().query(
    `INSERT INTO ipmgt_sections
      (id, name, description, parent_id, strict_mode, display_order, active, created_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      name,
      body.description || null,
      body.parent_id || null,
      !!body.strict_mode,
      Number(body.display_order) || 0,
      body.active === undefined ? true : !!body.active,
      now,
      user.username
    ]
  )
  await ipamAudit(user, 'ipmgt.section.create', id, { name })
  return { id }
})
