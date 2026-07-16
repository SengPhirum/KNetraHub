import { waitForDb, migrate } from '~~/server/utils/db'
import { migrateMonitoring } from '../db/migrate'
import { startDispatcher, stopDispatcher } from '../jobs/dispatcher'
import { startTrapReceiver, stopTrapReceiver } from '../receivers/traps'
import { startSyslogReceiver, stopSyslogReceiver } from '../receivers/syslog'
import { ensureDefaultAlertConfig } from '../alerting/defaults'

/**
 * Monitoring bootstrap: wait for Postgres → run the monitoring schema
 * migrations (incl. legacy-table archival) → seed default alert rules and
 * templates (config only — never fake devices/data) → register this node and
 * start the dispatcher + worker pool → start opt-in trap/syslog receivers.
 *
 * With NUXT_MONITORING_DISPATCHER_ENABLED=false the UI/API still work; this
 * node just neither schedules nor claims jobs.
 */
export default defineNitroPlugin((nitroApp) => {
  const config = useRuntimeConfig()
  if ((config.public as any).staticDocs) return

  setTimeout(async () => {
    try {
      await waitForDb()
      await migrate() // portal tables first (users/audit — FK-free but ordering keeps logs sane)
      await migrateMonitoring()
      await ensureDefaultAlertConfig()

      const rc = config.monitoring as Record<string, any>
      if (rc.dispatcherEnabled) {
        await startDispatcher()
      } else {
        console.log('[monitoring] dispatcher disabled on this node (NUXT_MONITORING_DISPATCHER_ENABLED=false)')
      }
      startTrapReceiver()
      startSyslogReceiver()
    } catch (err) {
      console.error('[monitoring] bootstrap failed:', err)
    }
  }, 2000)

  nitroApp.hooks.hook('close', () => {
    stopDispatcher()
    stopTrapReceiver()
    stopSyslogReceiver()
  })
})
