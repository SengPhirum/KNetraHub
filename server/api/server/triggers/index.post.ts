import { getDb } from '../../../utils/db'
import { nanoid } from 'nanoid'

// Create a trigger on a host, bound to one of its items.
export default defineEventHandler(async (event) => {
  const b = await readBody<{ host_id?: string; item_id?: string; name?: string; operator?: string; threshold?: number; for_seconds?: number; severity?: number }>(event)
  const hostId = (b.host_id || '').trim()
  const name = (b.name || '').trim()
  if (!hostId || !name) throw createError({ statusCode: 400, statusMessage: 'host_id and name are required' })
  const op = ['>', '<', '>=', '<=', '=', '!='].includes(b.operator || '') ? b.operator : '>'
  const sev = Math.min(5, Math.max(0, Number(b.severity) || 2))
  const db = getDb()
  const id = nanoid()
  await db.query(
    `INSERT INTO server_triggers (id, host_id, item_id, name, operator, threshold, for_seconds, severity, status, last_state, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'enabled','ok',$9)`,
    [id, hostId, b.item_id || null, name.slice(0, 200), op, Number(b.threshold) || 0, Number(b.for_seconds) || 0, sev, new Date().toISOString()]
  )
  return { id }
})
