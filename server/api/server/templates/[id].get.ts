import { getDb } from '../../../utils/db'

// Template detail: its items + triggers.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const db = getDb()
  const res = await db.query('SELECT * FROM server_templates WHERE id = $1', [id])
  if (!res.rows.length) throw createError({ statusCode: 404, statusMessage: 'Template not found' })
  const [items, triggers] = await Promise.all([
    db.query('SELECT * FROM server_template_items WHERE template_id = $1 ORDER BY name', [id]),
    db.query('SELECT * FROM server_template_triggers WHERE template_id = $1 ORDER BY severity DESC, name', [id])
  ])
  return { ...res.rows[0], items: items.rows, triggers: triggers.rows }
})
