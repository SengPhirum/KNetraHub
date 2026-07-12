import { getDb } from '~~/server/utils/db'
import { nanoid } from 'nanoid'
import { requireMonitoring } from '~~/layers/monitoring/server/utils/monitoringAuth'

// Create an action: notify a channel when a problem >= min_severity opens.
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'manager')
  const b = await readBody<{ name?: string; min_severity?: number; channel_id?: string; status?: string }>(event)
  const name = (b.name || '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  const sev = Math.min(5, Math.max(0, Number(b.min_severity) || 0))
  const db = getDb()
  const id = nanoid()
  await db.query(
    `INSERT INTO server_actions (id, name, min_severity, channel_id, status, created_at) VALUES ($1,$2,$3,$4,$5,$6)`,
    [id, name.slice(0, 160), sev, b.channel_id || null, b.status === 'disabled' ? 'disabled' : 'enabled', new Date().toISOString()]
  )
  return { id }
})
