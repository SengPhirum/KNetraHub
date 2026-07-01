import { getDb } from '../../../../utils/db'

// Manually close (resolve) a problem, and reset its trigger so the poller can
// re-open it if the condition is still breached next cycle.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const db = getDb()
  const now = new Date().toISOString()
  const res = await db.query('SELECT trigger_id FROM server_problems WHERE id = $1', [id])
  await db.query(`UPDATE server_problems SET status = 'resolved', r_clock = $1 WHERE id = $2`, [now, id])
  const triggerId = res.rows[0]?.trigger_id
  if (triggerId) await db.query(`UPDATE server_triggers SET last_state = 'ok', since = NULL WHERE id = $1`, [triggerId])
  return { success: true }
})
