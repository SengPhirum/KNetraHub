import { requireUser } from '~~/server/utils/auth'
import { assertSwarm, useDocker } from '~~/layers/docker/server/utils/docker'
import { getAgentReport } from '~~/server/utils/agentReports'

type UsageResult = {
  id: string
  hostname?: string
  available: boolean
  sampledAt: string
  source?: 'agent'
  error?: string
  cpu: { cores: number; percent: number }
  memory: { usedBytes: number; totalBytes: number; percent: number }
  disk: {
    usedBytes: number
    totalBytes?: number
    availableBytes?: number
    percent?: number
    dockerUsedBytes?: number
    path?: string
  }
  containers: { running: number; sampled: number }
}

function emptyUsage(node: any, error: string): UsageResult {
  return {
    id: node.ID,
    hostname: node.Description?.Hostname,
    available: false,
    sampledAt: new Date().toISOString(),
    error,
    cpu: { cores: 0, percent: 0 },
    memory: {
      usedBytes: 0,
      totalBytes: node.Description?.Resources?.MemoryBytes || 0,
      percent: 0
    },
    disk: { usedBytes: 0 },
    containers: { running: 0, sampled: 0 }
  }
}

export default defineEventHandler(async (event) => {
  await requireUser(event)
  await assertSwarm()

  const nodes = await useDocker().listNodes()
  const staleAfterMs = useRuntimeConfig().agent.staleAfterMs

  const results = nodes.map((node: any): UsageResult => {
    const report = getAgentReport(node.ID)
    if (!report) return emptyUsage(node, 'Waiting for the node agent to report in')
    if (Date.now() - report.receivedAt > staleAfterMs) {
      return emptyUsage(node, 'Node agent report is stale')
    }

    return {
      id: node.ID,
      hostname: report.hostname || node.Description?.Hostname,
      available: true,
      sampledAt: new Date(report.receivedAt).toISOString(),
      source: 'agent',
      cpu: report.cpu,
      memory: report.memory,
      disk: report.disk,
      containers: report.containers
    }
  })

  return {
    sampledAt: new Date().toISOString(),
    nodes: results
  }
})
