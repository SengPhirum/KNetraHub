import { getDb } from '~~/server/utils/db'
import { nanoid } from 'nanoid'
import { requireMonitoring } from '~~/layers/monitoring/server/utils/monitoringAuth'

// Create a template (items/triggers are added from its detail view).
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'manager')
  const body = await readBody<{ name?: string; description?: string }>(event)
  const name = (body.name || '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Template name is required' })
  const db = getDb()
  const id = nanoid()
  await db.query(
    'INSERT INTO server_templates (id, name, description, created_at) VALUES ($1, $2, $3, $4)',
    [id, name.slice(0, 120), (body.description || '').trim().slice(0, 500) || null, new Date().toISOString()]
  )
  return { id }
})
