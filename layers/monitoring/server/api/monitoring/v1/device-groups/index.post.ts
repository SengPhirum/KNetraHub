import { requireMonitoring } from '../../../../utils/monitoringAuth'
import { monDb, auditMonitoring, badRequest, conflict } from '../../../../utils/monApi'
import { validateConditions } from '../../../../alerting/conditions'
import { refreshGroupMembership } from '../../../../core/deviceGroups'

/**
 * POST /api/monitoring/v1/device-groups — create a group (admin).
 * Body: { name, description?, rules? (dynamic), device_ids? (static members) }
 */
export default defineEventHandler(async (event) => {
  const user = await requireMonitoring(event, 'admin')
  const db = await monDb()
  const body = await readBody(event)

  const name = String(body?.name ?? '').trim()
  if (!name) badRequest('name is required')
  const description = body?.description ? String(body.description).slice(0, 1000) : null

  let rules: unknown = null
  if (body?.rules != null) {
    const problems = validateConditions(body.rules)
    if (problems.length) badRequest(`invalid rules: ${problems.join('; ')}`)
    rules = body.rules
  }

  let id: number
  try {
    const res = await db.query(
      `INSERT INTO monitoring.device_groups (name, description, rules) VALUES ($1,$2,$3) RETURNING id`,
      [name, description, rules == null ? null : JSON.stringify(rules)]
    )
    id = Number(res.rows[0].id)
  } catch (err: any) {
    if (err?.code === '23505') conflict(`a group named "${name}" already exists`)
    throw err
  }

  if (rules == null && Array.isArray(body?.device_ids)) {
    for (const did of body.device_ids) {
      await db.query(
        `INSERT INTO monitoring.device_group_members (group_id, device_id, dynamic) VALUES ($1,$2,false)
         ON CONFLICT DO NOTHING`,
        [id, Number(did)]
      )
    }
  }
  if (rules != null) await refreshGroupMembership(db, id)

  await auditMonitoring(user.username, 'group.create', String(id), `name=${name}`)
  setResponseStatus(event, 201)
  return { id }
})
