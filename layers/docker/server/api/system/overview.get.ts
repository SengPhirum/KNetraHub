import { requireUser } from '~~/server/utils/auth'
import { assertSwarm, useDocker } from '~~/layers/docker/server/utils/docker'
import { STACK_LABEL } from '~~/layers/docker/server/utils/stack'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const info = await assertSwarm()
  const docker = useDocker()

  const [nodes, services, tasks, networks, volumes] = await Promise.all([
    docker.listNodes(),
    docker.listServices(),
    docker.listTasks(),
    docker.listNetworks(),
    docker.listVolumes().then((v) => v.Volumes || [])
  ])

  // Stack count only, derived from the services list already fetched above -
  // listStacks() independently re-fetches services/networks/volumes/tasks
  // plus configs/secrets this endpoint doesn't need, doubling the Docker
  // Engine API round-trips on every dashboard load/refresh for a single number.
  const stackCount = new Set(services.map((s) => s.Spec?.Labels?.[STACK_LABEL]).filter(Boolean)).size

  const nodeSummary = {
    total: nodes.length || 1, // avoid divide-by-zero
    ready: nodes.filter((n) => n.Status?.State === 'ready').length,
    managers: nodes.filter((n) => n.Spec?.Role === 'manager').length,
    workers: nodes.filter((n) => n.Spec?.Role === 'worker').length,
    down: nodes.filter((n) => n.Status?.State !== 'ready').length
  }

  const taskStates: Record<string, number> = {}
  for (const t of tasks) {
    const s = t.Status?.State || 'unknown'
    taskStates[s] = (taskStates[s] || 0) + 1
  }

  // resource capacity across the cluster
  let cpuNanos = 0
  let memBytes = 0
  for (const n of nodes) {
    cpuNanos += n.Description?.Resources?.NanoCPUs || 0
    memBytes += n.Description?.Resources?.MemoryBytes || 0
  }

  return {
    swarm: {
      id: info.Swarm?.Cluster?.ID,
      createdAt: info.Swarm?.Cluster?.CreatedAt,
      dockerVersion: info.ServerVersion
    },
    nodes: nodeSummary,
    counts: {
      services: services.length,
      tasks: tasks.length,
      runningTasks: taskStates['running'] || 0,
      networks: networks.length,
      volumes: volumes.length,
      stacks: stackCount
    },
    taskStates,
    capacity: { cpus: cpuNanos / 1e9, memoryBytes: memBytes }
  }
})
