import { getDb } from '~~/server/utils/db'
import { nanoid } from 'nanoid'

// Bulk-create device templates from an uploaded JSON array (or {templates:[]}).
// Native format only - device templates have no Zabbix equivalent. Existing
// templates with the same name are skipped rather than duplicated.
export default defineEventHandler(async (event) => {
  const body = await readBody<any>(event)
  const rows: any[] = Array.isArray(body) ? body : Array.isArray(body?.templates) ? body.templates : []
  if (!rows.length) throw createError({ statusCode: 400, statusMessage: 'Expected a list of templates' })

  const db = getDb()
  const existing = new Set((await db.query('SELECT name FROM net_device_templates')).rows.map((r) => r.name))
  let added = 0
  let skipped = 0

  for (const t of rows) {
    const name = String(t.name || '').trim()
    if (!name) { skipped++; continue }
    if (existing.has(name)) { skipped++; continue }
    await db.query(
      `INSERT INTO net_device_templates
        (id, name, description, category, poll_method, snmp_version, snmp_community,
         snmp_sec_level, snmp_auth_user, snmp_auth_protocol, snmp_priv_protocol, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        nanoid(), name.slice(0, 120), (t.description || '').slice(0, 300) || null,
        t.category || 'network', t.poll_method || 'snmp', t.snmp_version || null,
        t.snmp_community || null, t.snmp_sec_level || null, t.snmp_auth_user || null,
        t.snmp_auth_protocol || null, t.snmp_priv_protocol || null, new Date().toISOString()
      ]
    )
    existing.add(name)
    added++
  }

  return { added, skipped }
})
