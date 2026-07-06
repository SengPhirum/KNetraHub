import { getDb } from '~~/server/utils/db'
import { nanoid } from 'nanoid'

// Create a service node (optionally under a parent; leaf maps to a trigger).
export default defineEventHandler(async (event) => {
  const b = await readBody<{ name?: string; parent_id?: string; algorithm?: string; sla_target?: number; trigger_id?: string }>(event)
  const name = (b.name || '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  const db = getDb()
  const id = nanoid()
  await db.query(
    `INSERT INTO server_services (id, name, parent_id, algorithm, sla_target, trigger_id, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, name.slice(0, 160), b.parent_id || null, b.algorithm === 'most' ? 'most' : 'worst',
      Number(b.sla_target) || 99.9, b.trigger_id || null, new Date().toISOString()]
  )
  return { id }
})
