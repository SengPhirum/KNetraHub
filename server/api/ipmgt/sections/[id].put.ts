import { getDb } from '../../../utils/db'
import { requireIpam, ipamAudit } from '../../../utils/ipamStore'

// Update a section. parent_id cannot point at itself (avoid a trivial cycle).
export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'operator')
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)
  const db = getDb()

  const cur = await db.query('SELECT * FROM ipmgt_sections WHERE id = $1', [id])
  if (!cur.rows.length) throw createError({ statusCode: 404, statusMessage: 'Section not found' })

  if (body.parent_id && body.parent_id === id) {
    throw createError({ statusCode: 400, statusMessage: 'A section cannot be its own parent' })
  }

  const name = body.name !== undefined ? String(body.name).trim() : cur.rows[0].name
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Name is required' })

  await db.query(
    `UPDATE ipmgt_sections SET
       name = $2, description = $3, parent_id = $4, strict_mode = $5,
       display_order = $6, active = $7, updated_at = $8, updated_by = $9
     WHERE id = $1`,
    [
      id,
      name,
      body.description ?? cur.rows[0].description,
      body.parent_id ?? cur.rows[0].parent_id,
      body.strict_mode === undefined ? cur.rows[0].strict_mode : !!body.strict_mode,
      body.display_order === undefined ? cur.rows[0].display_order : Number(body.display_order) || 0,
      body.active === undefined ? cur.rows[0].active : !!body.active,
      new Date().toISOString(),
      user.username
    ]
  )
  await ipamAudit(user, 'ipmgt.section.update', id!, { name })
  return { id }
})
