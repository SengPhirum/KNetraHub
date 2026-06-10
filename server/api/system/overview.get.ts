import { requireUser } from '~~/server/utils/auth'
import { assertSwarm, useDocker } from '~~/server/utils/docker'
import { listStacks } from '~~/server/utils/stack'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const info = await assertSwarm()
  const docker = useDocker()

  const [nodes, services, tasks, networks, volumes, stacks] = await Promise.all([
    docker.listNodes(),
    docker.listServices(),
    docker.listTasks(),
    docker.listNetworks(),
    docker.listVolumes().then((v) => v.Volumes || []),
    listStacks()
  ])

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
      stacks: stacks.length
    },
    taskStates,
    capacity: { cpus: cpuNanos / 1e9, memoryBytes: memBytes },
    nodeList: nodes.map((n) => ({
      id: n.ID,
      hostname: n.Description?.Hostname,
      role: n.Spec?.Role,
      availability: n.Spec?.Availability,
      state: n.Status?.State,
      leader: n.ManagerStatus?.Leader || false,
      reachability: n.ManagerStatus?.Reachability,
      addr: n.Status?.Addr,
      engine: n.Description?.Engine?.EngineVersion,
      cpus: (n.Description?.Resources?.NanoCPUs || 0) / 1e9,
      memory: n.Description?.Resources?.MemoryBytes || 0
    }))
  }
})
