import { getDb } from '~~/server/utils/db'
import { nanoid } from 'nanoid'

// Generates an on-demand report by snapshotting current monitoring data into a
// JSON summary (availability / traffic / sensor-health / inventory), the way
// PRTG runs a report against selected sensors/tags for a period.
const TYPES = ['availability', 'traffic', 'sensor-health', 'inventory'] as const
type ReportType = (typeof TYPES)[number]

const TYPE_LABEL: Record<ReportType, string> = {
  availability: 'Availability Summary',
  traffic: 'Traffic Summary',
  'sensor-health': 'Sensor Health',
  inventory: 'Device Inventory'
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({}))
  const requested = String(body?.type || '')
  const type: ReportType = (TYPES as readonly string[]).includes(requested) ? (requested as ReportType) : 'availability'
  const period = String(body?.period || 'last-30d')
  const name = String(body?.name || TYPE_LABEL[type]).slice(0, 120)
  const db = getDb()

  const summary = await buildSummary(db, type)
  const id = nanoid()
  const createdAt = new Date().toISOString()
  await db.query(
    `INSERT INTO net_reports (id, name, type, period, format, summary, created_at) VALUES ($1, $2, $3, $4, 'html', $5, $6)`,
    [id, name, type, period, JSON.stringify(summary), createdAt]
  )
  return { id, name, type, period, format: 'html', summary, created_at: createdAt }
})

async function buildSummary(db: ReturnType<typeof getDb>, type: ReportType) {
  if (type === 'availability') {
    const dev = await db.query('SELECT hostname, status FROM net_devices')
    const total = dev.rows.length
    const up = dev.rows.filter((d) => d.status === 'up').length
    const down = dev.rows.filter((d) => d.status === 'down').length
    const pct = total ? ((up / total) * 100).toFixed(1) + '%' : '—'
    return {
      type,
      headline: [
        { label: 'Devices monitored', value: total },
        { label: 'Availability', value: pct },
        { label: 'Down', value: down }
      ],
      rows: dev.rows
        .filter((d) => d.status !== 'up')
        .map((d) => ({ label: d.hostname, value: 'down' }))
    }
  }

  if (type === 'traffic') {
    const flows = await db.query(`
      SELECT d.hostname AS label, SUM(f.bytes)::bigint AS bytes
      FROM net_flows f JOIN net_devices d ON f.device_id = d.id
      GROUP BY d.hostname ORDER BY bytes DESC LIMIT 8
    `)
    const totalBytes = flows.rows.reduce((a, r) => a + Number(r.bytes || 0), 0)
    return {
      type,
      headline: [
        { label: 'Total transferred', value: formatBytes(totalBytes) },
        { label: 'Top talkers', value: flows.rows.length }
      ],
      rows: flows.rows.map((r) => ({ label: r.label, value: formatBytes(Number(r.bytes || 0)) }))
    }
  }

  if (type === 'sensor-health') {
    const sensors = await db.query('SELECT current_value, limit_high, limit_low FROM net_sensors')
    let ok = 0, warning = 0, critical = 0
    for (const s of sensors.rows) {
      const v = Number(s.current_value), hi = Number(s.limit_high), lo = Number(s.limit_low)
      if (v > hi || v < lo) critical++
      else if (Number.isFinite(hi) && hi > 0 && v >= hi * 0.9) warning++
      else ok++
    }
    return {
      type,
      headline: [
        { label: 'Sensors', value: sensors.rows.length },
        { label: 'OK', value: ok },
        { label: 'Warning', value: warning },
        { label: 'Critical', value: critical }
      ],
      rows: [
        { label: 'OK', value: ok },
        { label: 'Warning (≥90% of limit)', value: warning },
        { label: 'Critical (out of range)', value: critical }
      ]
    }
  }

  // inventory
  const byCat = await db.query(`SELECT COALESCE(category, 'unknown') AS label, COUNT(*)::int AS value FROM net_devices GROUP BY category ORDER BY value DESC`)
  const byVendor = await db.query(`SELECT COALESCE(vendor, 'Unknown') AS label, COUNT(*)::int AS value FROM net_devices GROUP BY vendor ORDER BY value DESC LIMIT 8`)
  const total = await db.query('SELECT COUNT(*)::int AS c FROM net_devices')
  return {
    type,
    headline: [
      { label: 'Total devices', value: total.rows[0]?.c ?? 0 },
      { label: 'Categories', value: byCat.rows.length },
      { label: 'Vendors', value: byVendor.rows.length }
    ],
    rows: byVendor.rows.map((r) => ({ label: r.label, value: r.value }))
  }
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}
