import { getDb } from '../../../utils/db'

// A web scenario with its ordered steps + last results.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const db = getDb()
  const res = await db.query(`
    SELECT w.*, h.name AS host_name FROM server_web_scenarios w
    LEFT JOIN server_hosts h ON h.id = w.host_id WHERE w.id = $1
  `, [id])
  if (!res.rows.length) throw createError({ statusCode: 404, statusMessage: 'Scenario not found' })
  const steps = await db.query('SELECT * FROM server_web_steps WHERE scenario_id = $1 ORDER BY step_no ASC', [id])
  return { ...res.rows[0], steps: steps.rows }
})
