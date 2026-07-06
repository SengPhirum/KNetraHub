import { getDb } from '~~/server/utils/db'
import { nanoid } from 'nanoid'

// Append a step to a web scenario.
export default defineEventHandler(async (event) => {
  const scenarioId = getRouterParam(event, 'id')
  const b = await readBody<{ name?: string; url?: string; expected_status?: number; required_string?: string }>(event)
  const name = (b.name || '').trim()
  const url = (b.url || '').trim()
  if (!name || !url) throw createError({ statusCode: 400, statusMessage: 'Name and URL are required' })
  if (!/^https?:\/\//i.test(url)) throw createError({ statusCode: 400, statusMessage: 'URL must start with http:// or https://' })
  const db = getDb()
  const { rows } = await db.query('SELECT COALESCE(max(step_no), 0) + 1 AS next FROM server_web_steps WHERE scenario_id = $1', [scenarioId])
  const id = nanoid()
  await db.query(
    `INSERT INTO server_web_steps (id, scenario_id, step_no, name, url, expected_status, required_string)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, scenarioId, rows[0].next, name.slice(0, 120), url.slice(0, 500), Number(b.expected_status) || 200, (b.required_string || '').slice(0, 200) || null]
  )
  return { id }
})
