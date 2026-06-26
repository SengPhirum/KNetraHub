import { getDb } from '../../utils/db'

// AI-assisted monitoring (PRTG parity): anomaly detection, similar-sensor
// detection, and smart sensor recommendations. All derived heuristically from
// the current dataset - no external model - so it stays in the MVP's spirit
// while being genuinely useful signal.
export default defineEventHandler(async () => {
  const db = getDb()

  const devices = await db.query('SELECT id, hostname, ip, status, poll_method, category FROM net_devices')
  const sensors = await db.query(`
    SELECT s.id, s.sensor_type, s.name, s.current_value, s.limit_high, s.limit_low, d.hostname AS device_name
    FROM net_sensors s JOIN net_devices d ON s.device_id = d.id
  `)
  const ifaceCounts = await db.query('SELECT device_id, COUNT(*)::int AS c FROM net_interfaces GROUP BY device_id')
  const sensorCounts = await db.query('SELECT device_id, COUNT(*)::int AS c FROM net_sensors GROUP BY device_id')
  const grouped = await db.query('SELECT DISTINCT device_id FROM net_device_groups')

  const ifaceMap = new Map(ifaceCounts.rows.map((r) => [r.device_id, r.c]))
  const sensorMap = new Map(sensorCounts.rows.map((r) => [r.device_id, r.c]))
  const groupedSet = new Set(grouped.rows.map((r) => r.device_id))

  // --- Anomalies -----------------------------------------------------------
  const anomalies: Array<{ severity: string; target: string; metric: string; detail: string }> = []
  for (const d of devices.rows) {
    if (d.status === 'down') {
      anomalies.push({ severity: 'critical', target: d.hostname, metric: 'availability', detail: `Device is unreachable (${d.ip})` })
    }
  }
  for (const s of sensors.rows) {
    const v = Number(s.current_value), hi = Number(s.limit_high), lo = Number(s.limit_low)
    if (v > hi || v < lo) {
      anomalies.push({ severity: 'critical', target: s.device_name, metric: s.sensor_type, detail: `${s.name} = ${v} is outside the ${lo}–${hi} range` })
    } else if (Number.isFinite(hi) && hi > 0 && v >= hi * 0.9) {
      anomalies.push({ severity: 'warning', target: s.device_name, metric: s.sensor_type, detail: `${s.name} = ${v} is within 10% of its ${hi} limit` })
    }
  }

  // --- Similar sensors (fuzzy behaviour match within a sensor type) ---------
  const byType = new Map<string, typeof sensors.rows>()
  for (const s of sensors.rows) {
    const arr = byType.get(s.sensor_type) || []
    arr.push(s)
    byType.set(s.sensor_type, arr)
  }
  const similar: Array<{ similarity: number; type: string; a: string; b: string }> = []
  for (const [type, list] of byType) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!, b = list[j]!
        const hi = Math.max(Number(a.limit_high) || 1, Number(b.limit_high) || 1)
        const diff = Math.abs(Number(a.current_value) - Number(b.current_value))
        const sim = Math.max(0, 100 - (diff / hi) * 100)
        if (sim >= 85) {
          similar.push({
            similarity: Math.round(sim),
            type,
            a: `${a.device_name} · ${a.name}`,
            b: `${b.device_name} · ${b.name}`
          })
        }
      }
    }
  }
  similar.sort((x, y) => y.similarity - x.similarity)

  // --- Smart recommendations ----------------------------------------------
  const recommendations: Array<{ target: string; suggestion: string; reason: string }> = []
  for (const d of devices.rows) {
    if (d.poll_method === 'snmp' && !sensorMap.get(d.id)) {
      recommendations.push({ target: d.hostname, suggestion: 'Add hardware sensors', reason: 'SNMP device with no sensors discovered yet' })
    }
    if (d.poll_method === 'snmp' && !ifaceMap.get(d.id)) {
      recommendations.push({ target: d.hostname, suggestion: 'Discover interfaces', reason: 'No interfaces monitored for this SNMP device' })
    }
    if (d.poll_method === 'ping') {
      recommendations.push({ target: d.hostname, suggestion: 'Enable SNMP', reason: 'Ping-only device — SNMP unlocks traffic & hardware metrics' })
    }
    if (!groupedSet.has(d.id)) {
      recommendations.push({ target: d.hostname, suggestion: 'Assign to a group', reason: 'Ungrouped device is harder to manage at scale' })
    }
  }

  return {
    counts: {
      anomalies: anomalies.length,
      similar: similar.length,
      recommendations: recommendations.length
    },
    anomalies: anomalies.slice(0, 50),
    similar: similar.slice(0, 30),
    recommendations: recommendations.slice(0, 50)
  }
})
