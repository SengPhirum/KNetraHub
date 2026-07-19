import { isModuleEnabled } from '~~/server/utils/moduleDb'
import { migrateMonitoring } from '../db/migrate'
import { startDispatcher, stopDispatcher } from '../jobs/dispatcher'
import { startTrapReceiver, stopTrapReceiver } from '../receivers/traps'
import { startSyslogReceiver, stopSyslogReceiver } from '../receivers/syslog'
import { ensureDefaultAlertConfig } from '../alerting/defaults'

let active = false
let reconciling = false
let suspended = false
let reconcileRuntime: (() => Promise<void>) | null = null

/** Backup/restore uses these hooks so workers never retain a closed pool. */
export function suspendMonitoringRuntime(): void {
  suspended = true
  stopDispatcher()
  stopTrapReceiver()
  stopSyslogReceiver()
  active = false
}

export function resumeMonitoringRuntime(): void {
  suspended = false
  void reconcileRuntime?.()
}

/**
 * Reconciles Monitoring background services with the portal's runtime module
 * state. First enable starts migrations/workers/receivers without an app
 * restart; disabling stops them while retaining the dedicated database.
 */
export default defineNitroPlugin((nitroApp) => {
  const config = useRuntimeConfig()
  if ((config.public as any).staticDocs) return

  const reconcile = async () => {
    if (reconciling) return
    reconciling = true
    try {
      if (suspended) return
      const enabled = await isModuleEnabled('monitoring')
      if (!enabled && active) {
        stopDispatcher()
        stopTrapReceiver()
        stopSyslogReceiver()
        active = false
        console.log('[monitoring] module disabled; background services stopped')
        return
      }
      if (!enabled || active) return

      await migrateMonitoring()
      await ensureDefaultAlertConfig()
      const rc = config.monitoring as Record<string, any>
      if (rc.dispatcherEnabled) await startDispatcher()
      else console.log('[monitoring] dispatcher disabled on this node (NUXT_MONITORING_DISPATCHER_ENABLED=false)')
      startTrapReceiver()
      startSyslogReceiver()
      active = true
    } catch (error) {
      console.error('[monitoring] lifecycle reconciliation failed:', error)
    } finally {
      reconciling = false
    }
  }

  reconcileRuntime = reconcile

  const warmup = setTimeout(reconcile, 2000)
  const lifecycleTimer = setInterval(reconcile, 5000)

  nitroApp.hooks.hook('close', () => {
    clearTimeout(warmup)
    clearInterval(lifecycleTimer)
    stopDispatcher()
    stopTrapReceiver()
    stopSyslogReceiver()
    active = false
    reconcileRuntime = null
  })
})
