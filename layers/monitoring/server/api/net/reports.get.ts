import { getDb } from '~~/server/utils/db'

// Generated reports, newest first. The stored JSON summary is parsed so the
// page can render it directly.
export default defineEventHandler(async () => {
  const db = getDb()
  const res = await db.query('SELECT * FROM net_reports ORDER BY created_at DESC LIMIT 100')
  return res.rows.map((r) => ({
    ...r,
    summary: safeParse(r.summary)
  }))
})

function safeParse(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string') return {}
  try {
    return JSON.parse(value)
  } catch {
    return {}
  }
}
