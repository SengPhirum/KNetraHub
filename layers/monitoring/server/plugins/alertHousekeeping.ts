import { getDb } from '~~/server/utils/db'
import { logSystem } from '~~/server/utils/moduleLogs'

/**
 * Retention backstop for net_alerts and server_problems - unlike activity_log/
 * system_log (see moduleLogs.ts), neither table had any trim job, so resolved/
 * recovered rows accumulated forever and every list endpoint that reads them
 * (e.g. GET /api/net/alerts, the per-host problem_count subquery) got slower
 * as they grew. Fixed defaults rather than admin-configurable settings - this
 * is a defensive cap, not a feature - matching moduleLogs' schedule (shortly
 * after boot, then daily).
 */
const RETENTION_DAYS = 90
const MAX_ROWS = 50_000

async function trimNetAlerts(): Promise<number> {
  const db = getDb()
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString()
  let removed = 0
  removed += (await db.query(
    `DELETE FROM net_alerts WHERE status <> 'active' AND timestamp < $1`,
    [cutoff]
  )).rowCount || 0
  removed += (await db.query(
    `DELETE FROM net_alerts WHERE id NOT IN (SELECT id FROM net_alerts ORDER BY timestamp DESC LIMIT $1)`,
    [MAX_ROWS]
  )).rowCount || 0
  return removed
}

async function trimServerProblems(): Promise<number> {
  const db = getDb()
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString()
  let removed = 0
  removed += (await db.query(
    `DELETE FROM server_problems WHERE status <> 'problem' AND fired_at < $1`,
    [cutoff]
  )).rowCount || 0
  removed += (await db.query(
    `DELETE FROM server_problems WHERE id NOT IN (SELECT id FROM server_problems ORDER BY fired_at DESC LIMIT $1)`,
    [MAX_ROWS]
  )).rowCount || 0
  return removed
}

async function runAlertHousekeeping(): Promise<void> {
  const [alertsRemoved, problemsRemoved] = await Promise.all([trimNetAlerts(), trimServerProblems()])
  if (alertsRemoved || problemsRemoved) {
    await logSystem('monitoring', 'info', 'alert-housekeeping',
      `Trimmed ${alertsRemoved} net alert and ${problemsRemoved} server problem rows`)
  }
}

export default defineNitroPlugin(() => {
  if (useRuntimeConfig().public.staticDocs) return
  setTimeout(() => runAlertHousekeeping().catch((err) => console.error('[alertHousekeeping] failed', err)), 45_000)
  setInterval(() => runAlertHousekeeping().catch((err) => console.error('[alertHousekeeping] failed', err)), 24 * 3600 * 1000)
})
