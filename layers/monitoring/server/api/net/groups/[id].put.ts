import { getDb } from '~~/server/utils/db'

// Rename a group / edit its description.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody<{ name?: string; description?: string }>(event)
  const db = getDb()

  const exists = await db.query('SELECT id FROM net_groups WHERE id = $1', [id])
  if (!exists.rows.length) throw createError({ statusCode: 404, statusMessage: 'Group not found' })

  const fields: string[] = []
  const vals: unknown[] = []
  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) throw createError({ statusCode: 400, statusMessage: 'Group name is required' })
    fields.push(`name = $${fields.length + 1}`); vals.push(name.slice(0, 120))
  }
  if (body.description !== undefined) {
    fields.push(`description = $${fields.length + 1}`); vals.push(String(body.description).trim().slice(0, 500) || null)
  }
  if (!fields.length) return { success: true }

  vals.push(id)
  await db.query(`UPDATE net_groups SET ${fields.join(', ')} WHERE id = $${vals.length}`, vals)
  return { success: true }
})
