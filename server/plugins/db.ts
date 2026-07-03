import { getDb, migrate, waitForDb } from '../utils/db'
import { migrateMetrics } from '../utils/metrics'

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
    console.log('[db] migrations complete')
  } catch (err) {
    console.error('[db] could not connect/migrate - exiting so the orchestrator restarts this container', err)
    process.exit(1)
  }
})
