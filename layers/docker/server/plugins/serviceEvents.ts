import { getDockerDb as getDb, isModuleEnabled } from '~~/server/utils/moduleDb'
import { recordServiceStatusEvent } from '~~/server/utils/metrics'
import { logSystem } from '~~/server/utils/moduleLogs'
import { fireAlert } from '~~/layers/docker/server/utils/alertNotify'
import { getAlertRule } from '~~/layers/docker/server/utils/alertRules'
import { useDocker } from '~~/layers/docker/server/utils/docker'
import { STACK_LABEL } from '~~/layers/docker/server/utils/stack'
import { scheduleListPush, scheduleDetailPush } from '~~/layers/docker/server/utils/resourcePush'
import { computeTasksList } from '~~/layers/docker/server/api/tasks/index.get'
import { computeServicesList } from '~~/layers/docker/server/api/services/index.get'
import { computeServiceDetail } from '~~/layers/docker/server/api/services/[id].get'
import { computeStacksList } from '~~/layers/docker/server/api/stacks/index.get'
import { computeStackDetail } from '~~/layers/docker/server/api/stacks/[name]/index.get'

const POLL_INTERVAL_MS = 10_000

// Single, server-wide listener + poller that persists service_status_events
// for history. Deliberately separate from server/api/sse/events.get.ts,
// which opens one Docker events subscription PER connected browser tab and
// only forwards to that one client - reusing it here would multiply DB
// writes per open tab and die when the last tab closes. This plugin runs
// once for the life of the server process.
export default defineNitroPlugin(() => {
  if (useRuntimeConfig().public.staticDocs) return
  attachServiceEvents()
  pollTaskStates()
})

// Service create/update/remove ARE manager-visible via the swarm
// orchestration layer, so a push-based events subscription works for these.
async function attachServiceEvents() {
  if (!(await isModuleEnabled('docker').catch(() => false))) {
    setTimeout(attachServiceEvents, 8_000)
    return
  }
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
          void isModuleEnabled('docker').then((enabled) => {
            if (!enabled) return
            return recordServiceStatusEvent({
              serviceId: evt.Actor?.ID,
              serviceName: evt.Actor?.Attributes?.name,
              status: evt.Action
            })
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
    if (!(await isModuleEnabled('docker'))) {
      lastTaskState.clear()
      firstPoll = true
      return
    }
    const docker = useDocker()
    const [tasks, services] = await Promise.all([docker.listTasks(), docker.listServices()])
    const serviceNames = new Map((services as any[]).map((s) => [s.ID, s.Spec?.Name]))
    const stackByService = new Map((services as any[]).map((s) => [s.ID, s.Spec?.Labels?.[STACK_LABEL]]))
    const changedServiceIds = new Set<string>()

    // Node hostnames are only needed when a task-lifecycle alert actually
    // fires - resolved lazily, at most once per poll tick.
    let nodeNamesPromise: Promise<Map<string, string>> | null = null
    const nodeNames = () => {
      if (!nodeNamesPromise) {
        nodeNamesPromise = docker.listNodes()
          .then((nodes: any[]) => new Map(nodes.map((n) => [n.ID, n.Description?.Hostname || n.ID])))
          .catch(() => new Map<string, string>())
      }
      return nodeNamesPromise
    }

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
        if (task.ServiceID) changedServiceIds.add(task.ServiceID)
        await maybeFireTaskAlert(task, state, serviceNames, nodeNames)
      }
    }
    firstPoll = false

    // Task transitions aren't visible via the raw Docker events feed for
    // remote nodes (see comment above), so push list/detail refreshes for
    // whatever changed directly from this poll instead of the SSE handler.
    if (changedServiceIds.size) {
      scheduleListPush('tasks', computeTasksList)
      scheduleListPush('services', computeServicesList)
      const stacksToRefresh = new Set<string>()
      for (const serviceId of changedServiceIds) {
        scheduleDetailPush('service', serviceId, () => computeServiceDetail(serviceId))
        const stack = stackByService.get(serviceId)
        if (stack) stacksToRefresh.add(stack)
      }
      if (stacksToRefresh.size) {
        scheduleListPush('stacks', computeStacksList)
        for (const stack of stacksToRefresh) scheduleDetailPush('stack', stack, () => computeStackDetail(stack))
      }
    }
  } catch (err: any) {
    // Docker/swarm not reachable yet - try again next tick
    await logSystem('docker', 'debug', 'task.poll.failed', String(err?.message || err))
  } finally {
    setTimeout(pollTaskStates, POLL_INTERVAL_MS)
  }
}

// task_failed / task_shutdown alert rules ride on the same task-state diff
// this poller already computes. fireAlert itself no-ops when the rule is
// disabled and never throws, so a notification problem can't stall the poll.
async function maybeFireTaskAlert(
  task: any,
  state: string,
  serviceNames: Map<string, string | undefined>,
  nodeNames: () => Promise<Map<string, string>>
) {
  const failed = state === 'failed' || state === 'rejected'
  const shutdown = state === 'shutdown'
  if (!failed && !shutdown) return
  // Skip the node-name lookup entirely when the matching rule is off.
  const rule = await getAlertRule(failed ? 'task_failed' : 'task_shutdown').catch(() => null)
  if (!rule?.enabled) return

  const target = serviceNames.get(task.ServiceID) || task.ServiceID || 'unknown'
  const node = (await nodeNames()).get(task.NodeID) || task.NodeID || 'unknown'
  const message = task.Status?.Err || task.Status?.Message || ''
  const time = new Date().toISOString()

  if (failed) {
    await fireAlert({
      ruleType: 'task_failed',
      target,
      severity: 'warning',
      vars: { target, taskId: task.ID || '', state, node, error: message || 'no error message', time }
    })
  } else {
    await fireAlert({
      ruleType: 'task_shutdown',
      target,
      severity: 'info',
      vars: { target, taskId: task.ID || '', node, message: message ? `: ${message}` : '', time }
    })
  }
}
