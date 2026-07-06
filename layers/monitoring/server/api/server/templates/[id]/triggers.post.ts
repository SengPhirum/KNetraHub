import { getDb } from '~~/server/utils/db'
import { nanoid } from 'nanoid'

// Add a trigger definition to a template (bound to a template item by key).
export default defineEventHandler(async (event) => {
  const templateId = getRouterParam(event, 'id')
  const b = await readBody<{ name?: string; item_key?: string; operator?: string; threshold?: number; for_seconds?: number; severity?: number }>(event)
  const name = (b.name || '').trim()
  const itemKey = (b.item_key || '').trim()
  if (!name || !itemKey) throw createError({ statusCode: 400, statusMessage: 'Name and item key are required' })
  const op = ['>', '<', '>=', '<=', '=', '!='].includes(b.operator || '') ? b.operator : '>'
  const sev = Math.min(5, Math.max(0, Number(b.severity) || 2))
  const db = getDb()
  const id = nanoid()
  await db.query(
    `INSERT INTO server_template_triggers (id, template_id, name, item_key, operator, threshold, for_seconds, severity)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, templateId, name.slice(0, 160), itemKey.slice(0, 120), op, Number(b.threshold) || 0, Number(b.for_seconds) || 0, sev]
  )
  return { id }
})
