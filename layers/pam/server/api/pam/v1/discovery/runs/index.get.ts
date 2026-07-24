import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePamPermission } from '~~/layers/pam/server/utils/pamStore'

export default defineEventHandler(async (event) => {
  await requirePamPermission(event, 'pam.discovery.view')
  const q = getQuery(event)
  const db = getPamDb()
  const params: any[] = []
  let where = ''
  if (q.source_id) { params.push(String(q.source_id)); where = `WHERE source_id=$1` }
  const rows = (await db.query(`SELECT * FROM pam.discovery_runs ${where} ORDER BY started_at DESC LIMIT 100`, params)).rows
  return { runs: rows }
})
