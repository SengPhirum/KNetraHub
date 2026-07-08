export interface AgentReport {
  nodeId: string
  hostname?: string
  receivedAt: number
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

// One process (replicas: 1), so a module-level map is enough to hold the
// latest sample reported by each node's knetrahub-agent task.
const reports = new Map<string, AgentReport>()

export function recordAgentReport(report: AgentReport) {
  reports.set(report.nodeId, report)
}

export function getAgentReport(nodeId: string): AgentReport | undefined {
  return reports.get(nodeId)
}
