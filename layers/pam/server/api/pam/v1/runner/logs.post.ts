import { getPamDb } from '~~/server/utils/moduleDb'
import { requireRunner, appendRunnerLog } from '~~/layers/pam/server/utils/pamRunner'

/** Accept redacted structured log lines from a runner (secrets are re-redacted
 * server-side by appendRunnerLog before storage). Bounded per request. */
export default defineEventHandler(async (event) => {
  const runner = await requireRunner(event)
  const body = await readBody(event).catch(() => ({}))
  const entries: any[] = Array.isArray(body?.logs) ? body.logs.slice(0, 200) : []
  const db = getPamDb()
  for (const e of entries) {
    await appendRunnerLog(
      runner.id,
      e?.jobId ? String(e.jobId) : null,
      ['debug', 'info', 'warn', 'error'].includes(e?.level) ? e.level : 'info',
      String(e?.message ?? ''),
      db
    ).catch(() => {})
  }
  return { ok: true, accepted: entries.length }
})
