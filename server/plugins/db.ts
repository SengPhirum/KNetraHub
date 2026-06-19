import { getDb, migrate, waitForDb } from '../utils/db'
import { migrateMetrics } from '../utils/metrics'

export default defineNitroPlugin(async () => {
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
