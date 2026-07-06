import { getDb } from '~~/server/utils/db'

// Full host inventory as JSON, for the Hosts page's Export button. Groups and
// templates are exported by NAME (not id) so the file is portable to a
// different environment; import.post.ts resolves/creates groups by name and
// links templates that already exist there. SNMP passwords are excluded (a
// re-imported host needs credentials re-entered).
export default defineEventHandler(async () => {
  const db = getDb()
  const { rows: hosts } = await db.query(`
    SELECT id, name, ip, os, description, poll_method, snmp_version, snmp_community,
           snmp_sec_level, snmp_auth_user, snmp_auth_protocol, snmp_priv_protocol
    FROM server_hosts ORDER BY name ASC
  `)
  const { rows: groupLinks } = await db.query(`
    SELECT m.host_id, g.name FROM server_host_group_members m JOIN server_host_groups g ON g.id = m.group_id
  `)
  const { rows: templateLinks } = await db.query(`
    SELECT l.host_id, t.name FROM server_host_templates l JOIN server_templates t ON t.id = l.template_id
  `)
  const groupsByHost = new Map<string, string[]>()
  for (const g of groupLinks) { if (!groupsByHost.has(g.host_id)) groupsByHost.set(g.host_id, []); groupsByHost.get(g.host_id)!.push(g.name) }
  const templatesByHost = new Map<string, string[]>()
  for (const t of templateLinks) { if (!templatesByHost.has(t.host_id)) templatesByHost.set(t.host_id, []); templatesByHost.get(t.host_id)!.push(t.name) }

  return hosts.map(({ id, ...h }) => ({
    ...h,
    groups: groupsByHost.get(id) || [],
    templates: templatesByHost.get(id) || []
  }))
})
