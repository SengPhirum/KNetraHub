import { recordAgentReport } from '~~/layers/docker/server/utils/agentReports'
import { recordMetrics } from '~~/server/utils/metrics'
import { scheduleNodeUsagePush, scheduleMetricsPush } from '~~/layers/docker/server/utils/dashboardSnapshot'
import { scheduleListPush } from '~~/layers/docker/server/utils/resourcePush'
import { computeServicesUsage } from '~~/layers/docker/server/api/services/usage.get'
import { isModuleEnabled } from '~~/server/utils/moduleDb'

/**
 * Ingest endpoint for the knetrahub-agent task running on every swarm node
 * (deployed via `deploy: mode: global`). Each agent only ever talks to its
 * own local Docker socket and pushes a stats snapshot here, so KNetraHub never
 * needs the Docker API exposed over TCP on worker nodes.
 */
export default defineEventHandler(async (event) => {
  const token = useRuntimeConfig().agent.token
  if (token && getRequestHeader(event, 'x-agent-token') !== token) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid agent token' })
  }

  // Agents may remain deployed while the Docker subsystem is disabled. Accept
  // the heartbeat without retaining or broadcasting module data in that state.
  if (!(await isModuleEnabled('docker'))) {
    setResponseStatus(event, 202)
    return { ok: false, disabled: true }
  }

  const body = await readBody<Record<string, any>>(event)
  if (!body?.nodeId) {
    throw createError({ statusCode: 400, statusMessage: 'nodeId is required' })
  }

  recordAgentReport({
    nodeId: body.nodeId,
    hostname: body.hostname,
    receivedAt: Date.now(),
    cpu: body.cpu,
    memory: body.memory,
    disk: body.disk,
    containers: body.containers
  })
  scheduleNodeUsagePush()
  scheduleMetricsPush()
  scheduleListPush('services-usage', computeServicesUsage, 3_000)

  // Fire-and-forget: recordMetrics already try/catches internally, and a
  // slow/down Postgres must never add latency to the agent's report cycle
  // or break the live in-memory dashboard above.
  void recordMetrics({
    nodeId: body.nodeId,
    hostname: body.hostname,
    cpu: body.cpu,
    memory: body.memory,
    disk: body.disk,
    containers: body.containers
  })

  return { ok: true }
})
