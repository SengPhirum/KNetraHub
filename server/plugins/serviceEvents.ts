import { getDb, migrate } from '../utils/db'
import { migrateMetrics, recordServiceStatusEvent } from '../utils/metrics'
import { useDocker } from '../utils/docker'

const POLL_INTERVAL_MS = 10_000

// Single, server-wide listener + poller that persists service_status_events
// for history. Deliberately separate from server/api/sse/events.get.ts,
// which opens one Docker events subscription PER connected browser tab and
// only forwards to that one client - reusing it here would multiply DB
// writes per open tab and die when the last tab closes. This plugin runs
// once for the life of the server process.
export default defineNitroPlugin(async () => {
  if (useRuntimeConfig().public.staticDocs) return

  // Defensive: don't rely on server/plugins/db.ts having run first - both
  // migrate() and migrateMetrics() are memoized, so calling them again here
  // is cheap and removes any implicit plugin-ordering dependency.
  try {
    await migrate()
    await migrateMetrics(getDb(), useRuntimeConfig().metrics.retentionDays)
  } catch (err) {
    console.error('[serviceEvents] could not migrate, will not start listener', err)
    return
  }

  attachServiceEvents()
  pollTaskStates()
})

// Service create/update/remove ARE manager-visible via the swarm
// orchestration layer, so a push-based events subscription works for these.
function attachServiceEvents() {
  try {
    const docker = useDocker()
    docker.getEvents({ filters: { type: ['service'] } }, (err: Error | null, stream: any) => {
      if (err || !stream) {
        setTimeout(attachServiceEvents, 8_000)
        return
      }

      stream.on('data', (chunk: Buffer) => {
        try {
          const evt = JSON.parse(chunk.toString())
          void recordServiceStatusEvent({
            serviceId: evt.Actor?.ID,
            serviceName: evt.Actor?.Attributes?.name,
            status: evt.Action
          })
        } catch {
          // ignore malformed event
        }
      })
      stream.on('error', () => setTimeout(attachServiceEvents, 8_000))
      stream.on('end', () => setTimeout(attachServiceEvents, 8_000))
    })
  } catch {
    setTimeout(attachServiceEvents, 15_000)
  }
}

// Verified empirically: a swarm task's container events only ever reach the
// LOCAL engine that actually runs the task - the manager's /events stream
// has no visibility into container lifecycle on remote worker nodes. So
// task status can't be captured via events at all; poll docker.listTasks()
// instead, which IS cluster-wide via the swarm orchestration API, and diff
// against the last-seen state per task to detect transitions.
const lastTaskState = new Map<string, string>()
let firstPoll = true

async function pollTaskStates() {
  try {
    const docker = useDocker()
    const [tasks, services] = await Promise.all([docker.listTasks(), docker.listServices()])
    const serviceNames = new Map((services as any[]).map((s) => [s.ID, s.Spec?.Name]))

    for (const task of tasks as any[]) {
      const state = task.Status?.State
      if (!state) continue
      const changed = lastTaskState.get(task.ID) !== state
      lastTaskState.set(task.ID, state)
      // Skip recording on the very first poll after boot - that's just the
      // existing state of the world, not a transition worth logging.
      if (changed && !firstPoll) {
        void recordServiceStatusEvent({
          serviceId: task.ServiceID,
          serviceName: serviceNames.get(task.ServiceID),
          taskId: task.ID,
          nodeId: task.NodeID,
          status: state,
          message: task.Status?.Err || task.Status?.Message
        })
      }
    }
    firstPoll = false
  } catch {
    // Docker/swarm not reachable yet - try again next tick
  } finally {
    setTimeout(pollTaskStates, POLL_INTERVAL_MS)
  }
}
