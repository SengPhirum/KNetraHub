import { getDb } from '../../../utils/db'

// Service tree with rolled-up status + a 24h SLA computed from problem durations
// of each leaf's mapped trigger. Parent status uses the service's algorithm
// (worst = problem if any child is; most = problem if the majority are).
export default defineEventHandler(async () => {
  const db = getDb()
  const [{ rows: services }, { rows: triggers }, { rows: problems }] = await Promise.all([
    db.query('SELECT * FROM server_services ORDER BY sort_order ASC, name ASC'),
    db.query('SELECT id, last_state FROM server_triggers'),
    db.query(`SELECT trigger_id, fired_at, r_clock, status FROM server_problems WHERE fired_at::timestamptz > now() - interval '24 hours'`)
  ])

  const trigState = new Map<string, string>(triggers.map((t) => [t.id, t.last_state]))
  const childrenOf = new Map<string | null, any[]>()
  for (const s of services) {
    const key = s.parent_id || null
    if (!childrenOf.has(key)) childrenOf.set(key, [])
    childrenOf.get(key)!.push(s)
  }

  // 24h downtime (seconds) per trigger from problem intervals.
  const now = Date.now()
  const dayAgo = now - 86400_000
  const downtime = new Map<string, number>()
  for (const p of problems) {
    if (!p.trigger_id) continue
    const start = Math.max(dayAgo, Date.parse(p.fired_at))
    const end = p.r_clock ? Date.parse(p.r_clock) : now
    const secs = Math.max(0, (end - start) / 1000)
    downtime.set(p.trigger_id, (downtime.get(p.trigger_id) || 0) + secs)
  }

  function statusOf(s: any): 'problem' | 'ok' {
    const kids = childrenOf.get(s.id) || []
    if (kids.length) {
      const bad = kids.filter((k) => statusOf(k) === 'problem').length
      return (s.algorithm === 'most' ? bad > kids.length / 2 : bad > 0) ? 'problem' : 'ok'
    }
    return s.trigger_id && trigState.get(s.trigger_id) === 'problem' ? 'problem' : 'ok'
  }
  function sla24(s: any): number {
    const kids = childrenOf.get(s.id) || []
    if (kids.length) {
      const vals = kids.map(sla24)
      return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : 100
    }
    const dt = s.trigger_id ? (downtime.get(s.trigger_id) || 0) : 0
    return Math.round(Math.max(0, (1 - dt / 86400) * 100) * 100) / 100
  }

  return services.map((s) => ({ ...s, status: statusOf(s), sla_24h: sla24(s) }))
})
