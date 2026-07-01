import { getDb } from '../../../utils/db'

// Hosts with their groups + item/trigger/open-problem counts (Zabbix host list).
export default defineEventHandler(async () => {
  const db = getDb()
  const { rows: hosts } = await db.query(`
    SELECT h.*,
      (SELECT count(*)::int FROM server_items i WHERE i.host_id = h.id) AS item_count,
      (SELECT count(*)::int FROM server_triggers t WHERE t.host_id = h.id) AS trigger_count,
      (SELECT count(*)::int FROM server_problems p WHERE p.host_id = h.id AND p.status = 'problem') AS problem_count
    FROM server_hosts h
    ORDER BY h.name ASC
  `)
  const { rows: members } = await db.query(`
    SELECT m.host_id, g.id, g.name
    FROM server_host_group_members m JOIN server_host_groups g ON g.id = m.group_id
  `)
  const byHost = new Map<string, { id: string; name: string }[]>()
  for (const m of members) {
    if (!byHost.has(m.host_id)) byHost.set(m.host_id, [])
    byHost.get(m.host_id)!.push({ id: m.id, name: m.name })
  }
  return hosts.map((h) => ({ ...h, groups: byHost.get(h.id) || [] }))
})
