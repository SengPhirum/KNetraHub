import { getDb } from '../../../utils/db'
import { provisionHostFromTemplates } from '../../../utils/serverProvision'

interface HostBody {
  name?: string; ip?: string; os?: string; description?: string
  poll_method?: string
  snmp_version?: string; snmp_community?: string
  snmp_sec_level?: string; snmp_auth_user?: string; snmp_auth_protocol?: string
  snmp_auth_password?: string; snmp_priv_protocol?: string; snmp_priv_password?: string
  group_ids?: string[]; template_ids?: string[]
}

// Update a host's fields, group membership (set-semantics), and template links
// (re-provisioning newly linked templates' items/triggers).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const b = await readBody<HostBody>(event)
  const db = getDb()

  const cur = await db.query('SELECT id FROM server_hosts WHERE id = $1', [id])
  if (!cur.rows.length) throw createError({ statusCode: 404, statusMessage: 'Host not found' })

  const name = (b.name || '').trim()
  const ip = (b.ip || '').trim()
  if (!name || !ip) throw createError({ statusCode: 400, statusMessage: 'Name and IP / DNS are required' })
  const pollMethod = ['icmp', 'snmp', 'none'].includes(b.poll_method || '') ? b.poll_method : 'icmp'

  await db.query(
    `UPDATE server_hosts SET name=$1, ip=$2, os=$3, description=$4, poll_method=$5,
       snmp_version=$6, snmp_community=$7, snmp_sec_level=$8, snmp_auth_user=$9, snmp_auth_protocol=$10,
       snmp_auth_password=$11, snmp_priv_protocol=$12, snmp_priv_password=$13
     WHERE id=$14`,
    [name.slice(0, 120), ip.slice(0, 120), (b.os || '').slice(0, 120) || null, (b.description || '').slice(0, 500) || null,
      pollMethod, b.snmp_version || null, b.snmp_community || null, b.snmp_sec_level || null, b.snmp_auth_user || null,
      b.snmp_auth_protocol || null, b.snmp_auth_password || null, b.snmp_priv_protocol || null, b.snmp_priv_password || null, id]
  )

  if (Array.isArray(b.group_ids)) {
    await db.query('DELETE FROM server_host_group_members WHERE host_id = $1', [id])
    for (const gid of b.group_ids.filter((x) => typeof x === 'string')) {
      await db.query('INSERT INTO server_host_group_members (host_id, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, gid])
    }
  }
  if (Array.isArray(b.template_ids)) {
    await db.query('DELETE FROM server_host_templates WHERE host_id = $1', [id])
    for (const tid of b.template_ids.filter((x) => typeof x === 'string')) {
      await db.query('INSERT INTO server_host_templates (host_id, template_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, tid])
    }
    await provisionHostFromTemplates(id)
  }

  return { success: true }
})
