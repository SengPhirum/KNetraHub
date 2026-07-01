import { getDb } from '../../../utils/db'
import { nanoid } from 'nanoid'

// Create a web monitoring scenario (HTTP GET polled for status + latency).
export default defineEventHandler(async (event) => {
  const b = await readBody<{ name?: string; url?: string; expected_status?: number; interval?: number; host_id?: string }>(event)
  const name = (b.name || '').trim()
  const url = (b.url || '').trim()
  if (!name || !url) throw createError({ statusCode: 400, statusMessage: 'Name and URL are required' })
  if (!/^https?:\/\//i.test(url)) throw createError({ statusCode: 400, statusMessage: 'URL must start with http:// or https://' })
  const db = getDb()
  const id = nanoid()
  await db.query(
    `INSERT INTO server_web_scenarios (id, host_id, name, url, expected_status, interval, status, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,'enabled',$7)`,
    [id, b.host_id || null, name.slice(0, 120), url.slice(0, 500), Number(b.expected_status) || 200, Number(b.interval) || 60, new Date().toISOString()]
  )
  return { id }
})
