import { requireUser, resolveUserEntitlements } from '~~/server/utils/auth'
import { getDb } from '~~/server/utils/db'
import { getDockerDb } from '~~/server/utils/moduleDb'
import { getUserPreferences } from '~~/server/utils/store'

const RULE_TYPES: Record<string, string[]> = {
  deployFailures: ['deploy_failed'],
  nodeDown: ['node_down'],
  replicasDegraded: ['replicas_degraded', 'service_down'],
  diskUsage: ['disk_usage_threshold']
}

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const serverTime = new Date().toISOString()
  const query = getQuery(event)

  // Establish a server-clock cursor without replaying old alerts when a user
  // signs in or refreshes the portal.
  if (query.baseline === '1') return { events: [], serverTime }

  const since = typeof query.since === 'string' && !Number.isNaN(Date.parse(query.since))
    ? query.since
    : serverTime
  const prefs = await getUserPreferences(user.id)
  const entitlements = await resolveUserEntitlements(user)
  const events: Array<Record<string, any>> = []

  if (entitlements.docker) {
    const enabledRuleTypes = Object.entries(RULE_TYPES)
      .filter(([preference]) => Boolean((prefs.notifications as unknown as Record<string, unknown>)[preference]))
      .flatMap(([, types]) => types)

    if (enabledRuleTypes.length) {
      const { rows } = await getDockerDb().query(
        `SELECT id, rule_type, target, severity, message, fired_at
         FROM alert_events
         WHERE fired_at >= $1 AND rule_type = ANY($2::text[])
         ORDER BY fired_at ASC LIMIT 100`,
        [since, enabledRuleTypes]
      )
      events.push(...rows.map((row: any) => ({
        id: `alert:${row.id}`,
        title: row.target ? `${row.target} alert` : 'KNetraHub alert',
        message: row.message,
        severity: row.severity,
        firedAt: row.fired_at
      })))
    }
  }

  if (prefs.notifications.newLogin) {
    const { rows } = await getDb().query(
      `SELECT id, detail, ts FROM audit
       WHERE actor = $1 AND action = 'auth.login' AND ts >= $2
       ORDER BY ts ASC LIMIT 100`,
      [user.username, since]
    )
    events.push(...rows.map((row: any) => ({
      id: `login:${row.id}`,
      title: 'New sign-in',
      message: `Your account signed in${row.detail ? ` ${row.detail}` : ''}.`,
      severity: 'info',
      firedAt: row.ts
    })))
  }

  events.sort((a, b) => String(a.firedAt).localeCompare(String(b.firedAt)) || String(a.id).localeCompare(String(b.id)))
  return { events: events.slice(0, 100), serverTime }
})
