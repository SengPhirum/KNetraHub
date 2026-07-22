import { requireRole } from '~~/server/utils/auth'
import { getDockerDb as getDb } from '~~/server/utils/moduleDb'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin')
  const limit = Math.min(200, Number(getQuery(event).limit) || 50)
  const { rows } = await getDb().query(
    'SELECT id, rule_type, target, severity, message, fired_at FROM alert_events ORDER BY fired_at DESC LIMIT $1',
    [limit]
  )
  return rows.map((r: any) => ({
    id: r.id,
    ruleType: r.rule_type,
    target: r.target ?? undefined,
    severity: r.severity,
    message: r.message,
    firedAt: r.fired_at
  }))
})
