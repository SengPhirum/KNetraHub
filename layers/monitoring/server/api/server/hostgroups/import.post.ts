import { getDb } from '~~/server/utils/db'
import { nanoid } from 'nanoid'
import { requireMonitoring } from '~~/layers/monitoring/server/utils/monitoringAuth'

// Bulk-create host groups from an uploaded JSON array (or {groups:[]}).
// Existing groups with the same name are skipped.
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'manager')
  const body = await readBody<any>(event)
  const rows: any[] = Array.isArray(body) ? body : Array.isArray(body?.groups) ? body.groups : []
  if (!rows.length) throw createError({ statusCode: 400, statusMessage: 'Expected a list of groups' })

  const db = getDb()
  const existing = new Set((await db.query('SELECT name FROM server_host_groups')).rows.map((r) => r.name))
  let added = 0
  let skipped = 0

  for (const g of rows) {
    const name = String(g.name || '').trim()
    if (!name || existing.has(name)) { skipped++; continue }
    await db.query(
      'INSERT INTO server_host_groups (id, name, description, created_at) VALUES ($1,$2,$3,$4)',
      [nanoid(), name.slice(0, 120), (g.description || '').slice(0, 500) || null, new Date().toISOString()]
    )
    existing.add(name)
    added++
  }

  return { added, skipped }
})
