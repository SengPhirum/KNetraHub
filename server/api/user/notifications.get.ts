import { requireUser, resolveUserEntitlements } from '~~/server/utils/auth'
import { getDb } from '~~/server/utils/db'
import { getDockerDb } from '~~/server/utils/moduleDb'
import { getUserPreferences } from '~~/server/utils/store'

const ALERT_SEVERITIES = {
  criticalAlerts: 'critical',
  warningAlerts: 'warning',
  infoAlerts: 'info'
} as const

const ACTION_STAGES = {
  actionStarted: 'started',
  actionSucceeded: 'succeeded',
  actionFailed: 'failed'
} as const

const ACTION_COPY: Record<string, { progress: string; complete: string; label: string }> = {
  'create/run': { progress: 'starting', complete: 'completed', label: 'action' },
  create: { progress: 'creating', complete: 'created', label: 'create' },
  update: { progress: 'updating', complete: 'updated', label: 'update' },
  delete: { progress: 'deleting', complete: 'deleted', label: 'delete' },
  remove: { progress: 'removing', complete: 'removed', label: 'remove' },
  redeploy: { progress: 'redeploying', complete: 'redeployed', label: 'redeploy' },
  deploy: { progress: 'deploying', complete: 'deployed', label: 'deploy' },
  rollback: { progress: 'rolling back', complete: 'rolled back', label: 'rollback' },
  scale: { progress: 'scaling', complete: 'scaled', label: 'scale' },
  sync: { progress: 'synchronizing', complete: 'synchronized', label: 'sync' },
  test: { progress: 'testing', complete: 'tested', label: 'test' },
  reset: { progress: 'resetting', complete: 'reset', label: 'reset' }
}

function actionCopy(action: string, target?: string | null, stage?: string, detail?: string | null) {
  const [resource = 'Action', rawVerb = 'update'] = action.split(':').map((part) => part.trim())
  const verb = rawVerb || 'update'
  const copy = verb === 'create/run' && resource === 'stacks'
    ? ACTION_COPY.deploy!
    : ACTION_COPY[verb] || {
    progress: `${verb.replace(/e$/, '')}ing`,
    complete: `${verb} completed`,
    label: verb
  }
  let subject = target || resource.replace(/-/g, ' ').replace(/s$/, '')
  try { subject = decodeURIComponent(subject) } catch { /* keep the original target */ }
  if (stage === 'started') return { title: `${subject} is ${copy.progress}`, message: `${copy.label} started.` }
  if (stage === 'succeeded') return { title: `${subject} ${copy.complete} successfully`, message: `${copy.label} completed successfully.` }
  return { title: `${subject} ${copy.label} failed`, message: detail || `${copy.label} did not complete.` }
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
    const enabledSeverities = Object.entries(ALERT_SEVERITIES)
      .filter(([preference]) => Boolean((prefs.notifications as unknown as Record<string, unknown>)[preference]))
      .map(([, severity]) => severity)

    if (enabledSeverities.length) {
      const { rows } = await getDockerDb().query(
        `SELECT id, rule_type, target, severity, message, fired_at
         FROM alert_events
         WHERE fired_at >= $1 AND severity = ANY($2::text[])
         ORDER BY fired_at ASC LIMIT 100`,
        [since, enabledSeverities]
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

  const enabledActionStages = Object.entries(ACTION_STAGES)
    .filter(([preference]) => Boolean((prefs.notifications as unknown as Record<string, unknown>)[preference]))
    .map(([, stage]) => stage)

  if (enabledActionStages.length) {
    const { rows } = await getDb().query(
      `SELECT id, operation_id, module, action, target, stage, status, detail, ts
       FROM action_notification_events
       WHERE actor = $1 AND ts >= $2 AND stage = ANY($3::text[])
       ORDER BY ts ASC LIMIT 100`,
      [user.username, since, enabledActionStages]
    )
    events.push(...rows.map((row: any) => {
      const copy = actionCopy(row.action, row.target, row.stage, row.detail)
      return {
        id: `action:${row.id}`,
        title: copy.title,
        message: copy.message,
        severity: row.stage === 'failed' ? (Number(row.status || 500) >= 500 ? 'critical' : 'warning') : 'info',
        firedAt: row.ts
      }
    }))
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
