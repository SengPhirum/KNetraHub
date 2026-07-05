import { getDb } from '~~/server/utils/db'

// Every template with its items + triggers, in the native shape ({ name,
// description, items[], triggers[] }) - the same shape Zabbix import gets
// converted into, so exported files round-trip through import unchanged.
export default defineEventHandler(async () => {
  const db = getDb()
  const { rows: templates } = await db.query('SELECT id, name, description FROM server_templates ORDER BY name ASC')
  const out = []
  for (const t of templates) {
    const items = await db.query(
      'SELECT name, key_, type, value_type, units, snmp_oid, update_interval FROM server_template_items WHERE template_id = $1 ORDER BY name',
      [t.id]
    )
    const triggers = await db.query(
      'SELECT name, item_key, operator, threshold, for_seconds, severity FROM server_template_triggers WHERE template_id = $1 ORDER BY severity DESC, name',
      [t.id]
    )
    out.push({ name: t.name, description: t.description, items: items.rows, triggers: triggers.rows })
  }
  return out
})
