import { getDb } from '~~/server/utils/db'
import { nanoid } from 'nanoid'
import { provisionHostFromTemplates } from '~~/layers/monitoring/server/utils/serverProvision'

interface HostBody {
  name?: string; ip?: string; os?: string; description?: string
  poll_method?: string
  snmp_version?: string; snmp_community?: string
  snmp_sec_level?: string; snmp_auth_user?: string; snmp_auth_protocol?: string
  snmp_auth_password?: string; snmp_priv_protocol?: string; snmp_priv_password?: string
  group_ids?: string[]; template_ids?: string[]
}

// Create a host + its group memberships + template links, then provision the
// linked templates' items/triggers onto it.
export default defineEventHandler(async (event) => {
  const b = await readBody<HostBody>(event)
  const name = (b.name || '').trim()
  const ip = (b.ip || '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Host name is required' })
  if (!ip) throw createError({ statusCode: 400, statusMessage: 'IP / DNS is required' })

  const db = getDb()
  const id = nanoid()
  const now = new Date().toISOString()
  const pollMethod = ['icmp', 'snmp', 'none'].includes(b.poll_method || '') ? b.poll_method : 'icmp'

  await db.query(
    `INSERT INTO server_hosts
      (id, name, ip, os, description, status, availability, monitoring_enabled, poll_method,
       snmp_version, snmp_community, snmp_sec_level, snmp_auth_user, snmp_auth_protocol,
       snmp_auth_password, snmp_priv_protocol, snmp_priv_password, created_at)
     VALUES ($1,$2,$3,$4,$5,'Unknown','unknown',true,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [id, name.slice(0, 120), ip.slice(0, 120), (b.os || '').slice(0, 120) || null,
      (b.description || '').slice(0, 500) || null, pollMethod,
      b.snmp_version || null, b.snmp_community || null, b.snmp_sec_level || null, b.snmp_auth_user || null,
      b.snmp_auth_protocol || null, b.snmp_auth_password || null, b.snmp_priv_protocol || null,
      b.snmp_priv_password || null, now]
  )

  // A default SNMP interface so the host has an endpoint like Zabbix expects.
  await db.query(
    `INSERT INTO server_host_interfaces (id, host_id, type, ip, port, main)
     VALUES ($1, $2, $3, $4, $5, true)`,
    [nanoid(), id, pollMethod === 'snmp' ? 'snmp' : 'agent', ip.slice(0, 120), pollMethod === 'snmp' ? 161 : 10050]
  )

  for (const gid of (b.group_ids || []).filter((x) => typeof x === 'string')) {
    await db.query('INSERT INTO server_host_group_members (host_id, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, gid])
  }
  for (const tid of (b.template_ids || []).filter((x) => typeof x === 'string')) {
    await db.query('INSERT INTO server_host_templates (host_id, template_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, tid])
  }
  await provisionHostFromTemplates(id)

  return { id }
})
