import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePamPermission } from '~~/layers/pam/server/utils/pamStore'
import { DEFAULT_RISK_RULES } from '~~/layers/pam/server/utils/pamRisk'

/** Risk events with their rule definitions (pam.audit.view). */
export default defineEventHandler(async (event) => {
  await requirePamPermission(event, 'pam.audit.view')
  const db = getPamDb()
  const q = getQuery(event)
  const where: string[] = []
  const params: any[] = []
  let i = 1
  if (q.status) { where.push(`status = $${i++}`); params.push(String(q.status)) }
  else where.push(`status IN ('open','investigating')`)
  if (q.severity) { where.push(`severity = $${i++}`); params.push(String(q.severity)) }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const rules = new Map(DEFAULT_RISK_RULES.map((r) => [r.key, r]))
  const { rows } = await db.query(`SELECT * FROM pam.risk_events ${whereSql} ORDER BY created_at DESC LIMIT 300`, params)
  const summary = await db.query("SELECT severity, count(*)::int c FROM pam.risk_events WHERE status IN ('open','investigating') GROUP BY severity")
  return {
    events: rows.map((r) => ({ ...r, rule_name: rules.get(r.rule_key)?.name ?? r.rule_key, evidence: r.evidence ? JSON.parse(r.evidence) : null })),
    summary: Object.fromEntries(summary.rows.map((s) => [s.severity, s.c]))
  }
})
