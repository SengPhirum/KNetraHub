import { getDb } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const b = await readBody<{ name?: string; min_severity?: number; channel_id?: string; status?: string }>(event)
  const name = (b.name || '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  const sev = Math.min(5, Math.max(0, Number(b.min_severity) || 0))
  const db = getDb()
  const res = await db.query(
    `UPDATE server_actions SET name=$1, min_severity=$2, channel_id=$3, status=$4 WHERE id=$5`,
    [name.slice(0, 160), sev, b.channel_id || null, b.status === 'disabled' ? 'disabled' : 'enabled', id]
  )
  if (!res.rowCount) throw createError({ statusCode: 404, statusMessage: 'Action not found' })
  return { success: true }
})
