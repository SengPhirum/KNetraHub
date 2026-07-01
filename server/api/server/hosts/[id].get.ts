import { getDb } from '../../../utils/db'

// Full host detail: the host row + its groups, interfaces, linked templates,
// items (with latest value), and triggers (with current state).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const db = getDb()

  const res = await db.query('SELECT * FROM server_hosts WHERE id = $1', [id])
  if (!res.rows.length) throw createError({ statusCode: 404, statusMessage: 'Host not found' })

  const [groups, interfaces, templates, items, triggers] = await Promise.all([
    db.query(`SELECT g.id, g.name FROM server_host_group_members m JOIN server_host_groups g ON g.id = m.group_id WHERE m.host_id = $1 ORDER BY g.name`, [id]),
    db.query(`SELECT * FROM server_host_interfaces WHERE host_id = $1 ORDER BY main DESC`, [id]),
    db.query(`SELECT t.id, t.name FROM server_host_templates l JOIN server_templates t ON t.id = l.template_id WHERE l.host_id = $1 ORDER BY t.name`, [id]),
    db.query(`SELECT * FROM server_items WHERE host_id = $1 ORDER BY name`, [id]),
    db.query(`SELECT tr.*, i.name AS item_name, i.units AS item_units FROM server_triggers tr LEFT JOIN server_items i ON i.id = tr.item_id WHERE tr.host_id = $1 ORDER BY tr.severity DESC, tr.name`, [id])
  ])

  return {
    ...res.rows[0],
    groups: groups.rows,
    interfaces: interfaces.rows,
    templates: templates.rows,
    items: items.rows,
    triggers: triggers.rows
  }
})
