import { getDb } from '~~/server/utils/db'
import { requireMonitoring } from '~~/layers/monitoring/server/utils/monitoringAuth'
import { fireServerRecovery } from '~~/layers/monitoring/server/utils/serverMonitor'
import { logSystem } from '~~/server/utils/moduleLogs'

// Manually close (resolve) a problem, and reset its trigger so the poller can
// re-open it if the condition is still breached next cycle. Sends the same
// recovery notification a poller-detected resolution would.
export default defineEventHandler(async (event) => {
  const user = await requireMonitoring(event, 'operator')
  const id = getRouterParam(event, 'id')
  const db = getDb()
  const now = new Date().toISOString()
  const res = await db.query(
    `SELECT p.trigger_id, p.name, p.severity_num, p.status, p.suppressed, h.name AS host_name
     FROM server_problems p LEFT JOIN server_hosts h ON h.id = p.host_id WHERE p.id = $1`,
    [id]
  )
  if (!res.rows.length) throw createError({ statusCode: 404, statusMessage: 'Problem not found' })
  const problem = res.rows[0]

  await db.query(`UPDATE server_problems SET status = 'resolved', r_clock = $1 WHERE id = $2`, [now, id])
  if (problem.trigger_id) {
    await db.query(`UPDATE server_triggers SET last_state = 'ok', since = NULL WHERE id = $1`, [problem.trigger_id])
  }

  await logSystem('monitoring', 'info', 'server.problem.closed',
    `${user.username} manually closed problem "${problem.name}" on ${problem.host_name || 'unknown host'}`)
  if (problem.status === 'problem' && !problem.suppressed) {
    await fireServerRecovery(problem.host_name || 'unknown host', problem.name,
      Number(problem.severity_num) || 0, `manually closed by ${user.username}`)
  }
  return { success: true }
})
