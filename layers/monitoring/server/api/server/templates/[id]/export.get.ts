import { getDb } from '~~/server/utils/db'

// One template's native export shape (see ../export.get.ts for the bulk form).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const db = getDb()
  const t = await db.query('SELECT id, name, description FROM server_templates WHERE id = $1', [id])
  if (!t.rows.length) throw createError({ statusCode: 404, statusMessage: 'Template not found' })
  const items = await db.query(
    'SELECT name, key_, type, value_type, units, snmp_oid, update_interval FROM server_template_items WHERE template_id = $1 ORDER BY name',
    [id]
  )
  const triggers = await db.query(
    'SELECT name, item_key, operator, threshold, for_seconds, severity FROM server_template_triggers WHERE template_id = $1 ORDER BY severity DESC, name',
    [id]
  )
  return { name: t.rows[0].name, description: t.rows[0].description, items: items.rows, triggers: triggers.rows }
})
