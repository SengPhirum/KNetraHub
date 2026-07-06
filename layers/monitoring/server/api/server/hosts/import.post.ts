import { getDb } from '~~/server/utils/db'
import { nanoid } from 'nanoid'
import { parseCsv } from '~~/server/utils/importExport'
import { provisionHostFromTemplates } from '~~/layers/monitoring/server/utils/serverProvision'

interface ImportBody { format?: 'json' | 'csv'; content?: string }

// Bulk-create hosts from an uploaded JSON array or CSV (mirrors export.get.ts's
// columns). Groups referenced by name are auto-created if missing (so a fleet
// exported from one environment recreates its grouping in another); templates
// referenced by name are linked only if a template with that name already
// exists here (templates aren't auto-created - they carry item/trigger
// definitions that wouldn't come from a host row). Linked templates are then
// provisioned onto the host exactly like the normal Create Host flow.
export default defineEventHandler(async (event) => {
  const body = await readBody<ImportBody>(event)
  let rows: Record<string, any>[] = []
  try {
    rows = body.format === 'csv' ? parseCsv(body.content || '') : JSON.parse(body.content || '[]')
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Could not parse the uploaded file' })
  }
  if (!Array.isArray(rows)) throw createError({ statusCode: 400, statusMessage: 'Expected a list of hosts' })

  const db = getDb()
  const existingIps = new Set((await db.query('SELECT ip FROM server_hosts')).rows.map((r) => r.ip))
  const groupIdByName = new Map<string, string>((await db.query('SELECT id, name FROM server_host_groups')).rows.map((r) => [r.name, r.id]))
  const templateIdByName = new Map<string, string>((await db.query('SELECT id, name FROM server_templates')).rows.map((r) => [r.name, r.id]))

  let added = 0
  let skipped = 0
  const errors: { row: number; message: string }[] = []

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!
    const name = String(r.name || '').trim()
    const ip = String(r.ip || '').trim()
    if (!name || !ip) { errors.push({ row: i + 1, message: 'name and ip are required' }); continue }
    if (existingIps.has(ip)) { skipped++; continue }

    const hostId = nanoid()
    const now = new Date().toISOString()
    const pollMethod = ['icmp', 'snmp', 'none'].includes(r.poll_method) ? r.poll_method : 'icmp'
    await db.query(
      `INSERT INTO server_hosts
        (id, name, ip, os, description, status, availability, monitoring_enabled, poll_method,
         snmp_version, snmp_community, snmp_sec_level, snmp_auth_user, snmp_auth_protocol, snmp_priv_protocol, created_at)
       VALUES ($1,$2,$3,$4,$5,'Unknown','unknown',true,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [hostId, name.slice(0, 120), ip.slice(0, 120), (r.os || '').slice(0, 120) || null,
        (r.description || '').slice(0, 500) || null, pollMethod, r.snmp_version || null, r.snmp_community || null,
        r.snmp_sec_level || null, r.snmp_auth_user || null, r.snmp_auth_protocol || null, r.snmp_priv_protocol || null, now]
    )
    await db.query(
      `INSERT INTO server_host_interfaces (id, host_id, type, ip, port, main) VALUES ($1,$2,$3,$4,$5,true)`,
      [nanoid(), hostId, pollMethod === 'snmp' ? 'snmp' : 'agent', ip, pollMethod === 'snmp' ? 161 : 10050]
    )

    const groupNames: string[] = Array.isArray(r.groups) ? r.groups : String(r.groups || '').split(/[;,]/).map((s) => s.trim()).filter(Boolean)
    for (const gname of groupNames) {
      let gid = groupIdByName.get(gname)
      if (!gid) {
        gid = nanoid()
        await db.query('INSERT INTO server_host_groups (id, name, created_at) VALUES ($1,$2,$3)', [gid, gname.slice(0, 120), now])
        groupIdByName.set(gname, gid)
      }
      await db.query('INSERT INTO server_host_group_members (host_id, group_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [hostId, gid])
    }

    const templateNames: string[] = Array.isArray(r.templates) ? r.templates : String(r.templates || '').split(/[;,]/).map((s) => s.trim()).filter(Boolean)
    let linkedTemplate = false
    for (const tname of templateNames) {
      const tid = templateIdByName.get(tname)
      if (!tid) continue
      await db.query('INSERT INTO server_host_templates (host_id, template_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [hostId, tid])
      linkedTemplate = true
    }
    if (linkedTemplate) await provisionHostFromTemplates(hostId)

    existingIps.add(ip)
    added++
  }

  return { added, skipped, errors }
})
