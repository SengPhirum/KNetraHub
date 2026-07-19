import type { Pool } from 'pg'
import { getDockerDb } from './moduleDb'

export interface ContainerSample {
  id: string
  name?: string
  taskId?: string
  serviceId?: string
  cpuPercent: number
  memoryUsedBytes: number
  memoryLimitBytes: number
  networkRxBytes: number
  networkTxBytes: number
  state: string
}

export interface AgentReportForMetrics {
  nodeId: string
  hostname?: string
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
  containers: { running: number; sampled: number; list?: ContainerSample[] }
}

const migratedPools = new WeakMap<Pool, Promise<void>>()

/** Hypertable DDL + retention policies. Memoized like db.ts's migrate() so
 * it's safe to call from multiple Nitro plugins regardless of load order,
 * and from recordMetrics()/recordServiceStatusEvent() which call it
 * defensively on every write (see those functions for why). On failure the
 * memo is cleared rather than caching the rejection - otherwise one early
 * caller racing a still-booting Postgres (Timescale's first-ever boot can
 * take 10-30s) would permanently wedge metrics, even after Postgres recovers. */
export async function migrateMetrics(db: Pool, retentionDays: number): Promise<void> {
  let pending = migratedPools.get(db)
  if (!pending) {
    pending = runMetricsMigrations(db, retentionDays).catch((err) => {
      migratedPools.delete(db)
      throw err
    })
    migratedPools.set(db, pending)
  }
  return pending
}

async function runMetricsMigrations(db: Pool, retentionDays: number): Promise<void> {
  await db.query('CREATE EXTENSION IF NOT EXISTS timescaledb;')

  await db.query(`
    -- node_metrics: per-node aggregate CPU/memory sample, one row per agent report
    CREATE TABLE IF NOT EXISTS node_metrics (
      time TIMESTAMPTZ NOT NULL,
      node_id TEXT NOT NULL,
      hostname TEXT,
      cpu_percent DOUBLE PRECISION,
      cpu_cores DOUBLE PRECISION,
      memory_used BIGINT,
      memory_limit BIGINT,
      memory_percent DOUBLE PRECISION,
      containers_running INTEGER,
      containers_sampled INTEGER
    );
  `)
  await db.query(`SELECT create_hypertable('node_metrics', 'time', if_not_exists => TRUE);`)
  await db.query(`CREATE INDEX IF NOT EXISTS idx_node_metrics_node_time ON node_metrics (node_id, time DESC);`)

  await db.query(`
    -- container_metrics: per-container sample, N rows per agent report.
    -- container_id is not stable across task restarts - task_id/service_id
    -- (from swarm labels) are what service/task-level charts should group by.
    CREATE TABLE IF NOT EXISTS container_metrics (
      time TIMESTAMPTZ NOT NULL,
      node_id TEXT NOT NULL,
      container_id TEXT NOT NULL,
      container_name TEXT,
      task_id TEXT,
      service_id TEXT,
      cpu_percent DOUBLE PRECISION,
      memory_used BIGINT,
      memory_limit BIGINT,
      state TEXT
    );
  `)
  await db.query(`SELECT create_hypertable('container_metrics', 'time', if_not_exists => TRUE);`)
  await db.query(`CREATE INDEX IF NOT EXISTS idx_container_metrics_container_time ON container_metrics (container_id, time DESC);`)
  await db.query(`CREATE INDEX IF NOT EXISTS idx_container_metrics_task_time ON container_metrics (task_id, time DESC);`)
  // Backs the service-scoped queries (dashboard metrics, /api/services/usage
  // polled every 5s, service/stack detail) that filter/group by service_id -
  // without this they fall back to a sequential scan of the recent chunk(s).
  await db.query(`CREATE INDEX IF NOT EXISTS idx_container_metrics_service_time ON container_metrics (service_id, time DESC);`)

  await db.query(`
    -- disk_usage: per-node disk sample
    CREATE TABLE IF NOT EXISTS disk_usage (
      time TIMESTAMPTZ NOT NULL,
      node_id TEXT NOT NULL,
      used_bytes BIGINT,
      total_bytes BIGINT,
      available_bytes BIGINT,
      percent DOUBLE PRECISION,
      docker_used_bytes BIGINT,
      path TEXT
    );
  `)
  await db.query(`SELECT create_hypertable('disk_usage', 'time', if_not_exists => TRUE);`)
  await db.query(`CREATE INDEX IF NOT EXISTS idx_disk_usage_node_time ON disk_usage (node_id, time DESC);`)

  await db.query(`
    -- network_usage: per-container network sample. rx/tx are CUMULATIVE
    -- counters as reported by Docker's stats API - store raw, compute rates
    -- (max-min per bucket) in the query layer, never average/sum them raw.
    CREATE TABLE IF NOT EXISTS network_usage (
      time TIMESTAMPTZ NOT NULL,
      node_id TEXT NOT NULL,
      container_id TEXT NOT NULL,
      container_name TEXT,
      task_id TEXT,
      service_id TEXT,
      rx_bytes BIGINT,
      tx_bytes BIGINT
    );
  `)
  await db.query(`SELECT create_hypertable('network_usage', 'time', if_not_exists => TRUE);`)
  await db.query(`CREATE INDEX IF NOT EXISTS idx_network_usage_container_time ON network_usage (container_id, time DESC);`)
  // Backs the service-scoped network throughput query (service detail page).
  await db.query(`CREATE INDEX IF NOT EXISTS idx_network_usage_service_time ON network_usage (service_id, time DESC);`)

  await db.query(`
    -- node_heartbeat: lightweight "node agent reported in" event, decoupled
    -- from node_metrics so an uptime/availability chart doesn't need to scan
    -- the heavier metrics table.
    CREATE TABLE IF NOT EXISTS node_heartbeat (
      time TIMESTAMPTZ NOT NULL,
      node_id TEXT NOT NULL,
      hostname TEXT
    );
  `)
  await db.query(`SELECT create_hypertable('node_heartbeat', 'time', if_not_exists => TRUE);`)
  await db.query(`CREATE INDEX IF NOT EXISTS idx_node_heartbeat_node_time ON node_heartbeat (node_id, time DESC);`)

  await db.query(`
    -- service_status_events: event-sourced (not sampled) - one row per
    -- Docker service/task event observed by the single server-wide listener.
    CREATE TABLE IF NOT EXISTS service_status_events (
      time TIMESTAMPTZ NOT NULL,
      service_id TEXT,
      service_name TEXT,
      task_id TEXT,
      node_id TEXT,
      status TEXT NOT NULL,
      message TEXT
    );
  `)
  await db.query(`SELECT create_hypertable('service_status_events', 'time', if_not_exists => TRUE);`)
  await db.query(`CREATE INDEX IF NOT EXISTS idx_service_status_events_service_time ON service_status_events (service_id, time DESC);`)

  // Retention: $1 = NUXT_METRICS_RETENTION_DAYS (default 30). INTERVAL literals
  // can't be parameterized directly, so multiply a 1-day interval by an int param.
  for (const table of ['node_metrics', 'container_metrics', 'disk_usage', 'network_usage', 'node_heartbeat', 'service_status_events']) {
    await db.query(
      `SELECT add_retention_policy('${table}', INTERVAL '1 day' * $1::int, if_not_exists => TRUE);`,
      [retentionDays]
    )
  }

  // Compression: shrink the on-disk/page-cache footprint of the highest-volume
  // hypertables once their chunks age past the "recent dashboard" window (the
  // agent reports every 5s per node, so these grow fastest - see recordMetrics).
  // Segmented by the column each table's hot queries already filter/group by
  // (see the indexes above), so compressed chunks still scan cheaply. Best
  // effort and isolated per table - if the Timescale edition/version here
  // doesn't support compression, ingestion must keep working uncompressed
  // rather than failing migrateMetrics() entirely.
  const compressionTargets: { table: string; segmentBy: string }[] = [
    { table: 'node_metrics', segmentBy: 'node_id' },
    { table: 'container_metrics', segmentBy: 'service_id' },
    { table: 'network_usage', segmentBy: 'service_id' }
  ]
  for (const { table, segmentBy } of compressionTargets) {
    try {
      await db.query(
        `ALTER TABLE ${table} SET (timescaledb.compress, timescaledb.compress_segmentby = '${segmentBy}', timescaledb.compress_orderby = 'time DESC');`
      )
      await db.query(`SELECT add_compression_policy('${table}', INTERVAL '3 days', if_not_exists => TRUE);`)
    } catch (err) {
      console.error(`[metrics] failed to enable compression for ${table}`, err)
    }
  }
}

/** Best-effort: never throws. A Postgres hiccup must never break
 * /api/agent/report or the live in-memory dashboard (agentReports.ts). */
export async function recordMetrics(report: AgentReportForMetrics): Promise<void> {
  try {
    const db = getDockerDb()
    // Defensive: Nitro doesn't await plugins before it starts accepting
    // requests, so the knetrahub-agent's first reports after a fresh deploy
    // can otherwise land here before server/plugins/db.ts's migrateMetrics()
    // call has finished creating the hypertables. Memoized, so this is a
    // no-op once that call has completed.
    await migrateMetrics(db, useRuntimeConfig().metrics.retentionDays)
    const now = new Date()

    await db.query(
      `INSERT INTO node_metrics (time, node_id, hostname, cpu_percent, cpu_cores, memory_used, memory_limit, memory_percent, containers_running, containers_sampled)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [now, report.nodeId, report.hostname ?? null, report.cpu.percent, report.cpu.cores,
        report.memory.usedBytes, report.memory.totalBytes, report.memory.percent,
        report.containers.running, report.containers.sampled]
    )

    await db.query(
      `INSERT INTO disk_usage (time, node_id, used_bytes, total_bytes, available_bytes, percent, docker_used_bytes, path)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [now, report.nodeId, report.disk.usedBytes, report.disk.totalBytes ?? null,
        report.disk.availableBytes ?? null, report.disk.percent ?? null,
        report.disk.dockerUsedBytes ?? null, report.disk.path ?? null]
    )

    await db.query(
      `INSERT INTO node_heartbeat (time, node_id, hostname) VALUES ($1,$2,$3)`,
      [now, report.nodeId, report.hostname ?? null]
    )

    // Batched as two multi-row inserts (not one query per container) - the
    // agent reports every 5s per node, so N containers previously meant 2N
    // sequential round trips here on top of the 3 above, every cycle.
    const containers = report.containers.list ?? []
    if (containers.length) {
      const cmParams: unknown[] = []
      const cmValues = containers.map((c, i) => {
        const b = i * 10
        cmParams.push(now, report.nodeId, c.id, c.name ?? null, c.taskId ?? null, c.serviceId ?? null,
          c.cpuPercent, c.memoryUsedBytes, c.memoryLimitBytes, c.state)
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10})`
      })
      await db.query(
        `INSERT INTO container_metrics (time, node_id, container_id, container_name, task_id, service_id, cpu_percent, memory_used, memory_limit, state)
         VALUES ${cmValues.join(',')}`,
        cmParams
      )

      const nuParams: unknown[] = []
      const nuValues = containers.map((c, i) => {
        const b = i * 8
        nuParams.push(now, report.nodeId, c.id, c.name ?? null, c.taskId ?? null, c.serviceId ?? null, c.networkRxBytes, c.networkTxBytes)
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8})`
      })
      await db.query(
        `INSERT INTO network_usage (time, node_id, container_id, container_name, task_id, service_id, rx_bytes, tx_bytes)
         VALUES ${nuValues.join(',')}`,
        nuParams
      )
    }
  } catch (err) {
    console.error('[metrics] failed to record agent report', err)
  }
}

export async function recordServiceStatusEvent(evt: {
  serviceId?: string
  serviceName?: string
  taskId?: string
  nodeId?: string
  status: string
  message?: string
}): Promise<void> {
  try {
    const db = getDockerDb()
    await migrateMetrics(db, useRuntimeConfig().metrics.retentionDays)
    await db.query(
      `INSERT INTO service_status_events (time, service_id, service_name, task_id, node_id, status, message)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [new Date(), evt.serviceId ?? null, evt.serviceName ?? null, evt.taskId ?? null, evt.nodeId ?? null, evt.status, evt.message ?? null]
    )
  } catch (err) {
    console.error('[metrics] failed to record service status event', err)
  }
}
