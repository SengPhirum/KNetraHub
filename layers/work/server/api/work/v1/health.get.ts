import { getWork, requireWork } from '~~/layers/work/server/utils/workStore'

/** Module health: database reachability + schema migration state. */
export default defineEventHandler(async (event) => {
  await requireWork(event)
  const db = getWork()
  const started = Date.now()
  await db.query('SELECT 1')
  const { rows } = await db.query('SELECT id, applied_at FROM work.schema_migrations ORDER BY applied_at')
  return {
    ok: true,
    db_latency_ms: Date.now() - started,
    migrations: rows
  }
})
