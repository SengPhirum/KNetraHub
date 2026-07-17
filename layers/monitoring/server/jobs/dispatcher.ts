import os from 'node:os'
import { getDb } from '~~/server/utils/db'
import { enqueue, claim, complete, fail, reapExpiredLeases, type JobRow } from './queue'
import { runPoll } from '../polling/engine'
import { runDiscovery } from '../discovery/engine'
import { runDiscoveryScan } from '../discovery/scan'
import { runDueServiceChecks } from '../services/runner'
import { evaluateAlertRules } from '../alerting/evaluate'
import { runHousekeeping } from './housekeeping'
import { calculateBills } from '../billing/calculate'

/**
 * Dispatcher + worker pool for one poller node.
 *
 * The dispatcher tick (5s) is deliberately cheap: enqueue due work with
 * dedupe keys (so N nodes scheduling the same device collapse to one job),
 * reap expired leases, heartbeat, then let the worker pool claim jobs with
 * FOR UPDATE SKIP LOCKED. Long-running work never happens on the tick.
 */

let dispatcher: NodeJS.Timeout | null = null
let running = 0
let stopping = false

export function nodeId(): string {
  const rc = useRuntimeConfig().monitoring as Record<string, any>
  return String(rc.pollerName || os.hostname())
}

export async function startDispatcher(): Promise<void> {
  const rc = useRuntimeConfig().monitoring as Record<string, any>
  const db = getDb()
  const id = nodeId()
  const group = Number(rc.pollerGroup ?? 0)
  const concurrency = Number(rc.workerConcurrency ?? 16)
  const version = (useRuntimeConfig().public as any)?.appVersion ?? 'dev'

  await db.query(
    `INSERT INTO monitoring.poller_nodes (id, poller_group, version, started_at, last_heartbeat_at, worker_concurrency)
     VALUES ($1,$2,$3,now(),now(),$4)
     ON CONFLICT (id) DO UPDATE SET poller_group = $2, version = $3, started_at = now(),
       last_heartbeat_at = now(), worker_concurrency = $4, enabled = true`,
    [id, group, version, concurrency]
  )

  // Expose the node name to engines without re-reading config everywhere.
  process.env.NUXT_MONITORING_POLLER_NAME = id

  let tickRunning = false
  dispatcher = setInterval(async () => {
    if (tickRunning || stopping) return
    tickRunning = true
    try {
      await scheduleDueWork()
      await reapExpiredLeases(db)
      await heartbeat()
      await claimAndRun()
    } catch (err) {
      console.error('[monitoring:dispatcher] tick failed', err)
    } finally {
      tickRunning = false
    }
  }, 5000)

  console.log(`[monitoring] dispatcher started as poller node "${id}" (group ${group}, concurrency ${concurrency})`)
}

export function stopDispatcher(): void {
  stopping = true
  if (dispatcher) clearInterval(dispatcher)
  dispatcher = null
}

async function heartbeat(): Promise<void> {
  const db = getDb()
  await db.query(
    `UPDATE monitoring.poller_nodes SET last_heartbeat_at = now(), jobs_in_progress = $2 WHERE id = $1`,
    [nodeId(), running]
  )
}

/** Enqueue everything due, guarded by dedupe keys. */
async function scheduleDueWork(): Promise<void> {
  const db = getDb()

  // Device polls — down devices retry every downRetrySeconds via a fast path.
  const duePolls = await db.query(
    `SELECT id, poller_group FROM monitoring.devices
     WHERE NOT disabled AND next_poll_at <= now() LIMIT 500`
  )
  for (const row of duePolls.rows) {
    await enqueue(db, { type: 'poll', deviceId: Number(row.id), pollerGroup: Number(row.poller_group), dedupeKey: `poll:${row.id}`, priority: 50 })
  }

  const rc = useRuntimeConfig().monitoring as Record<string, any>
  const downRetry = Number(rc.downRetrySeconds ?? 60)
  const dueDownRetries = await db.query(
    `SELECT id, poller_group FROM monitoring.devices
     WHERE NOT disabled AND status = 'down'
       AND (last_ping_at IS NULL OR last_ping_at < now() - make_interval(secs => $1))
     LIMIT 200`,
    [downRetry]
  )
  for (const row of dueDownRetries.rows) {
    await enqueue(db, { type: 'poll', deviceId: Number(row.id), pollerGroup: Number(row.poller_group), dedupeKey: `poll:${row.id}`, priority: 20 })
  }

  const dueDiscovery = await db.query(
    `SELECT id, poller_group FROM monitoring.devices
     WHERE NOT disabled AND next_discovery_at <= now() LIMIT 100`
  )
  for (const row of dueDiscovery.rows) {
    await enqueue(db, { type: 'discovery', deviceId: Number(row.id), pollerGroup: Number(row.poller_group), dedupeKey: `discovery:${row.id}`, priority: 80 })
  }

  // Singleton periodic jobs (dedupe key includes the time bucket). Marked
  // global so they run even on deployments where every node has a dedicated
  // non-zero poller_group and none is left running the default group 0.
  const minuteBucket = Math.floor(Date.now() / 60000)
  await enqueue(db, { type: 'alerts', global: true, dedupeKey: `alerts:${minuteBucket}`, priority: 10, maxAttempts: 1 })
  await enqueue(db, { type: 'services', global: true, dedupeKey: `services:${minuteBucket}`, priority: 40, maxAttempts: 1 })
  await enqueue(db, { type: 'billing', global: true, dedupeKey: `billing:${minuteBucket}`, priority: 90, maxAttempts: 1 })
  const dayBucket = new Date().toISOString().slice(0, 10)
  await enqueue(db, { type: 'housekeeping', global: true, dedupeKey: `housekeeping:${dayBucket}`, priority: 200, maxAttempts: 1 })
}

async function claimAndRun(): Promise<void> {
  const rc = useRuntimeConfig().monitoring as Record<string, any>
  const concurrency = Number(rc.workerConcurrency ?? 16)
  const capacity = concurrency - running
  if (capacity <= 0) return

  const db = getDb()
  const jobs = await claim(db, nodeId(), Number(rc.pollerGroup ?? 0), capacity)
  for (const job of jobs) {
    running++
    void executeJob(job)
      .then(async () => {
        await complete(db, job.id)
        await db.query(`UPDATE monitoring.poller_nodes SET jobs_completed = jobs_completed + 1 WHERE id = $1`, [nodeId()])
      })
      .catch(async (err) => {
        console.error(`[monitoring:worker] job ${job.id} (${job.type}) failed:`, err?.message ?? err)
        await fail(db, job, String(err?.message ?? err))
        await db.query(`UPDATE monitoring.poller_nodes SET jobs_failed = jobs_failed + 1 WHERE id = $1`, [nodeId()])
      })
      .finally(() => {
        running--
      })
  }
}

async function executeJob(job: JobRow): Promise<void> {
  switch (job.type) {
    case 'poll':
      if (job.device_id == null) throw new Error('poll job without device')
      await runPoll(job.device_id, job.id)
      return
    case 'discovery':
      if (job.device_id == null) throw new Error('discovery job without device')
      await runDiscovery(job.device_id, job.id)
      return
    case 'discovery_scan': {
      const scanId = Number((job.payload as any)?.scanId)
      if (!scanId) throw new Error('discovery_scan job without scanId')
      await runDiscoveryScan(scanId)
      return
    }
    case 'services':
      await runDueServiceChecks()
      return
    case 'alerts':
      await evaluateAlertRules()
      return
    case 'billing':
      await calculateBills()
      return
    case 'housekeeping':
      await runHousekeeping()
      return
    default:
      throw new Error(`unknown job type ${job.type}`)
  }
}
