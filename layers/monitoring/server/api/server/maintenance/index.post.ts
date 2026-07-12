import { getDb } from '~~/server/utils/db'
import { nanoid } from 'nanoid'
import { requireMonitoring } from '~~/layers/monitoring/server/utils/monitoringAuth'

// Create a maintenance window (host/group scope; JSON id arrays).
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'manager')
  const b = await readBody<{ name?: string; active_since?: string; active_till?: string; host_ids?: string[]; group_ids?: string[]; description?: string }>(event)
  const name = (b.name || '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  if (!b.active_since || !b.active_till) throw createError({ statusCode: 400, statusMessage: 'Start and end times are required' })
  const db = getDb()
  const id = nanoid()
  await db.query(
    `INSERT INTO server_maintenance (id, name, active_since, active_till, host_ids, group_ids, description, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, name.slice(0, 160), new Date(b.active_since).toISOString(), new Date(b.active_till).toISOString(),
      JSON.stringify((b.host_ids || []).filter((x) => typeof x === 'string')),
      JSON.stringify((b.group_ids || []).filter((x) => typeof x === 'string')),
      (b.description || '').slice(0, 500) || null, new Date().toISOString()]
  )
  return { id }
})
