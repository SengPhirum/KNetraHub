import { getDb } from '~~/server/utils/db'

// Templates with item/trigger/linked-host counts.
export default defineEventHandler(async () => {
  const db = getDb()
  const { rows } = await db.query(`
    SELECT t.*,
      (SELECT count(*)::int FROM server_template_items ti WHERE ti.template_id = t.id) AS item_count,
      (SELECT count(*)::int FROM server_template_triggers tt WHERE tt.template_id = t.id) AS trigger_count,
      (SELECT count(*)::int FROM server_host_templates ht WHERE ht.template_id = t.id) AS host_count
    FROM server_templates t
    ORDER BY t.name ASC
  `)
  return rows
})
