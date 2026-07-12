import { getDb } from '~~/server/utils/db'
import { nanoid } from 'nanoid'
import { requireMonitoring } from '~~/layers/monitoring/server/utils/monitoringAuth'

// Create a web monitoring scenario (HTTP GET polled for status + latency).
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'manager')
  const b = await readBody<{ name?: string; url?: string; expected_status?: number; interval?: number; host_id?: string }>(event)
  const name = (b.name || '').trim()
  const url = (b.url || '').trim()
  if (!name || !url) throw createError({ statusCode: 400, statusMessage: 'Name and URL are required' })
  if (!/^https?:\/\//i.test(url)) throw createError({ statusCode: 400, statusMessage: 'URL must start with http:// or https://' })
  const db = getDb()
  const id = nanoid()
  const now = new Date().toISOString()
  const expected = Number(b.expected_status) || 200
  await db.query(
    `INSERT INTO server_web_scenarios (id, host_id, name, url, expected_status, interval, status, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,'enabled',$7)`,
    [id, b.host_id || null, name.slice(0, 120), url.slice(0, 500), expected, Number(b.interval) || 60, now]
  )
  // Seed step 1 from the primary URL; more steps are added on the detail page.
  await db.query(
    `INSERT INTO server_web_steps (id, scenario_id, step_no, name, url, expected_status) VALUES ($1,$2,1,$3,$4,$5)`,
    [nanoid(), id, 'Step 1', url.slice(0, 500), expected]
  )
  return { id }
})
