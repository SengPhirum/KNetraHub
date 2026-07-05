import { getDb } from '~~/server/utils/db'

// Edit a trigger (condition/severity/status).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const b = await readBody<{ name?: string; item_id?: string; operator?: string; threshold?: number; for_seconds?: number; severity?: number; status?: string }>(event)
  const name = (b.name || '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  const op = ['>', '<', '>=', '<=', '=', '!='].includes(b.operator || '') ? b.operator : '>'
  const sev = Math.min(5, Math.max(0, Number(b.severity) || 2))
  const status = b.status === 'disabled' ? 'disabled' : 'enabled'
  const db = getDb()
  const res = await db.query(
    `UPDATE server_triggers SET name=$1, item_id=$2, operator=$3, threshold=$4, for_seconds=$5, severity=$6, status=$7 WHERE id=$8`,
    [name.slice(0, 200), b.item_id || null, op, Number(b.threshold) || 0, Number(b.for_seconds) || 0, sev, status, id]
  )
  if (!res.rowCount) throw createError({ statusCode: 404, statusMessage: 'Trigger not found' })
  return { success: true }
})
