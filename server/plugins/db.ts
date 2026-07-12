import { getDb, migrate, waitForDb } from '../utils/db'
import { migrateMetrics } from '../utils/metrics'
import { logSystem } from '../utils/moduleLogs'

export default defineNitroPlugin(async () => {
  // The docs-only static build (NUXT_STATIC_DOCS=true) has no database - it
  // just prerenders /documentation and must not depend on Postgres being up.
  if (useRuntimeConfig().public.staticDocs) {
    console.log('[db] skipped (static docs build)')
    return
  }
  try {
    await waitForDb()
    await migrate()
    await migrateMetrics(getDb(), useRuntimeConfig().metrics.retentionDays)
    await logSystem('portal', 'info', 'db.migrated', 'Database connected and migrations complete')
  } catch (err) {
    console.error('[db] could not connect/migrate - exiting so the orchestrator restarts this container', err)
    process.exit(1)
  }
})
