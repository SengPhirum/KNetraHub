import { isModuleEnabled } from '~~/server/utils/moduleDb'
import { migratePam } from '../db/migrate'
import { seedPam } from '../utils/pamSeed'
import { workerTick } from '../utils/pamJobs'
import { sweepExpiredGrants, sweepJitRevocations, scheduleDueRotations, maybeCheckpoint } from '../utils/pamScheduler'

/**
 * Reconciles PAM background work with the portal's runtime module state. On
 * first enable it migrates + seeds without an app restart, then runs the
 * credential worker and periodic maintenance (grant expiry, JIT revocation,
 * due rotations, signed audit checkpoints). Disabling stops the loops while
 * retaining the dedicated database.
 *
 * The credential worker runs in-process here for the fully self-hosted single
 * node. For horizontal scale the same job queue is claimed by the dedicated
 * services/pam/worker replicas (FOR UPDATE SKIP LOCKED lets any number of
 * workers cooperate safely); this loop is idempotent alongside them.
 */
let active = false
let reconciling = false

const WORKER = `${process.env.NUXT_PAM_WORKER_NAME || 'inproc'}-${process.pid}`
const WORKER_ENABLED = process.env.NUXT_PAM_WORKER_ENABLED !== 'false'

export default defineNitroPlugin((nitroApp) => {
  const config = useRuntimeConfig()
  if ((config.public as any).staticDocs) return

  let workerTimer: ReturnType<typeof setInterval> | null = null
  let maintTimer: ReturnType<typeof setInterval> | null = null

  const stopLoops = () => {
    if (workerTimer) { clearInterval(workerTimer); workerTimer = null }
    if (maintTimer) { clearInterval(maintTimer); maintTimer = null }
    active = false
  }

  const reconcile = async () => {
    if (reconciling) return
    reconciling = true
    try {
      const enabled = await isModuleEnabled('pam')
      if (!enabled && active) {
        stopLoops()
        console.log('[pam] module disabled; background services stopped')
        return
      }
      if (!enabled || active) return

      await migratePam()
      await seedPam()
      active = true
      console.log('[pam] module ready; vault + audit initialized')

      if (WORKER_ENABLED) {
        workerTimer = setInterval(() => {
          workerTick(WORKER).catch((err) => console.error('[pam:worker] tick failed', err?.message))
        }, 5000)
      }
      maintTimer = setInterval(() => {
        Promise.allSettled([
          sweepExpiredGrants(),
          sweepJitRevocations(),
          scheduleDueRotations(),
          maybeCheckpoint()
        ]).catch(() => {})
      }, 30_000)
    } catch (error) {
      console.error('[pam] lifecycle reconciliation failed:', error)
    } finally {
      reconciling = false
    }
  }

  const warmup = setTimeout(reconcile, 2500)
  const lifecycleTimer = setInterval(reconcile, 5000)

  nitroApp.hooks.hook('close', () => {
    clearTimeout(warmup)
    clearInterval(lifecycleTimer)
    stopLoops()
  })
})
