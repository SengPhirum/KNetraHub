import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePamPermission } from '~~/layers/pam/server/utils/pamStore'

/** Credential-job history/queue (pam.account.view). */
export default defineEventHandler(async (event) => {
  await requirePamPermission(event, 'pam.account.view')
  const db = getPamDb()
  const q = getQuery(event)
  const where: string[] = []
  const params: any[] = []
  let i = 1
  if (q.status) { where.push(`status = $${i++}`); params.push(String(q.status)) }
  if (q.accountId) { where.push(`account_id = $${i++}`); params.push(String(q.accountId)) }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const { rows } = await db.query(
    `SELECT id, job_type, account_id, status, priority, trigger, attempts, max_attempts, run_after,
            last_error, created_at, started_at, finished_at
       FROM pam.credential_jobs ${whereSql} ORDER BY created_at DESC LIMIT 200`,
    params
  )
  const summary = await db.query('SELECT status, count(*)::int c FROM pam.credential_jobs GROUP BY status')
  return { jobs: rows, summary: Object.fromEntries(summary.rows.map((s) => [s.status, s.c])) }
})
