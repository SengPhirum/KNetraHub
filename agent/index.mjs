#!/usr/bin/env node
// dockhub-agent: deployed as a `deploy: mode: global` swarm service so one
// task runs on every node. Each task only ever talks to its OWN local
// Docker socket (raw HTTP, no dependencies, no remote TCP API) and posts a
// stats snapshot back to the DockHub app, which is how it learns the usage
// of nodes it isn't running on. Mirrors swarmpit-agent's role, kept minimal.
import { statfs } from 'node:fs/promises'
import http from 'node:http'

const SOCKET_PATH = process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock'
const TARGET_URL = process.env.DOCKHUB_AGENT_URL || 'http://dockhub_app:3000/api/agent/report'
const TOKEN = process.env.DOCKHUB_AGENT_TOKEN || ''
const INTERVAL_MS = Number(process.env.DOCKHUB_AGENT_INTERVAL_MS) || 5000
const REQUEST_TIMEOUT_MS = 5000

function dockerGet(path) {
  return new Promise((resolve, reject) => {
    const req = http.request({ socketPath: SOCKET_PATH, path, method: 'GET', headers: { Host: 'localhost' } }, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`${path} -> HTTP ${res.statusCode}`))
          return
        }
        try {
          resolve(data ? JSON.parse(data) : null)
        } catch (err) {
          reject(err)
        }
      })
    })
    req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(new Error(`${path} timed out`)))
    req.on('error', reject)
    req.end()
  })
}

function round(value, digits) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function containerCpuPercent(stats) {
  const cpuDelta = (stats.cpu_stats?.cpu_usage?.total_usage || 0) - (stats.precpu_stats?.cpu_usage?.total_usage || 0)
  const systemDelta = (stats.cpu_stats?.system_cpu_usage || 0) - (stats.precpu_stats?.system_cpu_usage || 0)
  const onlineCpus = stats.cpu_stats?.online_cpus || stats.cpu_stats?.cpu_usage?.percpu_usage?.length || 1
  if (cpuDelta <= 0 || systemDelta <= 0) return 0
  return (cpuDelta / systemDelta) * onlineCpus * 100
}

function containerMemoryBytes(stats) {
  const usage = stats.memory_stats?.usage || 0
  const inactiveFile = stats.memory_stats?.stats?.total_inactive_file || stats.memory_stats?.stats?.cache || 0
  return Math.max(0, usage - inactiveFile)
}

function containerNetworkBytes(stats) {
  let rx = 0
  let tx = 0
  for (const iface of Object.values(stats.networks || {})) {
    rx += Number(iface?.rx_bytes) || 0
    tx += Number(iface?.tx_bytes) || 0
  }
  return { rx, tx }
}

function dockerDfUsedBytes(df) {
  let used = Number(df?.LayersSize) || 0
  for (const container of df?.Containers || []) used += Number(container?.SizeRw) || 0
  for (const volume of df?.Volumes || []) used += Number(volume?.UsageData?.Size) || 0
  for (const cache of df?.BuildCache || []) used += Number(cache?.Size) || 0
  return used
}

function filesystemDiskUsage(stats, path, dockerUsedBytes) {
  const blockSize = Number(stats?.bsize || 0)
  const blocks = Number(stats?.blocks || 0)
  const freeBlocks = Number(stats?.bfree || 0)
  const availableBlocks = Number(stats?.bavail ?? freeBlocks)
  const totalBytes = blockSize * blocks
  const freeBytes = blockSize * freeBlocks
  const availableBytes = blockSize * availableBlocks
  const usedBytes = Math.max(0, totalBytes - freeBytes)
  const percent = totalBytes > 0 ? Math.min(100, (usedBytes / totalBytes) * 100) : 0

  return {
    usedBytes,
    totalBytes,
    availableBytes,
    percent: round(percent, 1),
    dockerUsedBytes,
    path
  }
}

async function collectDiskUsage(paths, dockerUsedBytes) {
  const candidates = [...new Set(paths.filter(Boolean))]
  for (const path of candidates) {
    try {
      const stats = await statfs(path)
      return filesystemDiskUsage(stats, path, dockerUsedBytes)
    } catch {
      // Keep trying fallbacks; DockerRootDir is often not mounted inside the agent container.
    }
  }
  return { usedBytes: dockerUsedBytes, dockerUsedBytes }
}

async function collect() {
  const info = await dockerGet('/info')
  const nodeId = info?.Swarm?.NodeID
  if (!nodeId) throw new Error('This node is not part of an active swarm')

  const cpuCoresTotal = Number(info.NCPU) || 0
  const memoryTotal = Number(info.MemTotal) || 0

  const [containers, df] = await Promise.all([
    dockerGet('/containers/json'),
    dockerGet('/system/df').catch(() => null)
  ])

  const stats = await Promise.all((containers || []).map(async (container) => {
    try {
      return await dockerGet(`/containers/${container.Id}/stats?stream=false`)
    } catch {
      return null
    }
  }))

  const cpuTotalPercent = stats.reduce((total, item) => total + (item ? containerCpuPercent(item) : 0), 0)
  const cpuCores = cpuTotalPercent / 100
  const cpuPercent = cpuCoresTotal > 0 ? Math.min(100, (cpuCores / cpuCoresTotal) * 100) : 0

  const memoryUsedBytes = stats.reduce((total, item) => total + (item ? containerMemoryBytes(item) : 0), 0)
  const memoryPercent = memoryTotal > 0 ? Math.min(100, (memoryUsedBytes / memoryTotal) * 100) : 0
  const dockerUsedBytes = dockerDfUsedBytes(df)
  const disk = await collectDiskUsage([info.DockerRootDir, '/', '/var/lib/docker'], dockerUsedBytes)

  // Per-container breakdown for history graphs - built from the same stats
  // already fetched above for the aggregate, so no extra Docker API calls.
  const containerList = (containers || []).map((container, i) => {
    const s = stats[i]
    if (!s) return null
    const net = containerNetworkBytes(s)
    return {
      id: container.Id,
      name: (container.Names?.[0] || '').replace(/^\//, ''),
      taskId: container.Labels?.['com.docker.swarm.task.id'],
      serviceId: container.Labels?.['com.docker.swarm.service.id'],
      cpuPercent: round(containerCpuPercent(s), 1),
      memoryUsedBytes: containerMemoryBytes(s),
      memoryLimitBytes: Number(s.memory_stats?.limit) || 0,
      networkRxBytes: net.rx,
      networkTxBytes: net.tx,
      state: container.State
    }
  }).filter(Boolean)

  return {
    nodeId,
    hostname: info.Name,
    cpu: { cores: round(cpuCores, 3), percent: round(cpuPercent, 1) },
    memory: { usedBytes: memoryUsedBytes, totalBytes: memoryTotal, percent: round(memoryPercent, 1) },
    disk,
    containers: { running: (containers || []).length, sampled: stats.filter(Boolean).length, list: containerList }
  }
}

async function tick() {
  try {
    const report = await collect()
    const res = await fetch(TARGET_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(TOKEN ? { 'x-agent-token': TOKEN } : {})
      },
      body: JSON.stringify(report)
    })
    if (!res.ok) {
      console.error(`[dockhub-agent] report rejected: ${res.status} ${await res.text().catch(() => '')}`)
    }
  } catch (err) {
    console.error(`[dockhub-agent] requested to: ${TARGET_URL}, report failed: ${err?.message || err}`)
  }
}

tick()
setInterval(tick, INTERVAL_MS)
