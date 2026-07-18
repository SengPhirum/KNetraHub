import { requireMonitoring } from '../../../../../utils/monitoringAuth'
import { monDb, idParam, auditMonitoring, badRequest, conflict, notFound } from '../../../../../utils/monApi'
import { validateConditions } from '../../../../../alerting/conditions'
import { refreshGroupMembership } from '../../../../../core/deviceGroups'

/**
 * PUT /api/monitoring/v1/device-groups/:id — update a group (admin).
 * Passing rules: null converts the group to static; a rules tree converts it
 * to dynamic (and recomputes membership immediately). device_ids (when given)
 * replaces the static member set.
 */
export default defineEventHandler(async (event) => {
  const user = await requireMonitoring(event, 'admin')
  const db = await monDb()
  const id = idParam(event)
  const body = await readBody(event)

  const existing = await db.query(`SELECT * FROM monitoring.device_groups WHERE id = $1`, [id])
  if (!existing.rows.length) notFound('device group')

  const sets: string[] = []
  const args: unknown[] = [id]
  const set = (col: string, value: unknown) => {
    args.push(value)
    sets.push(`${col} = $${args.length}`)
  }

  if (body?.name !== undefined) {
    const name = String(body.name ?? '').trim()
    if (!name) badRequest('name cannot be empty')
    set('name', name)
  }
  if (body?.description !== undefined) set('description', body.description ? String(body.description).slice(0, 1000) : null)

  let rulesChanged = false
  if (body?.rules !== undefined) {
    if (body.rules != null) {
      const problems = validateConditions(body.rules)
      if (problems.length) badRequest(`invalid rules: ${problems.join('; ')}`)
      set('rules', JSON.stringify(body.rules))
    } else {
      set('rules', null)
    }
    rulesChanged = true
  }

  if (sets.length) {
    try {
      await db.query(`UPDATE monitoring.device_groups SET ${sets.join(', ')} WHERE id = $1`, args)
    } catch (err: any) {
      if (err?.code === '23505') conflict('a group with that name already exists')
      throw err
    }
  }

  if (rulesChanged && body.rules == null) {
    // Now static: drop rule-derived members.
    await db.query(`DELETE FROM monitoring.device_group_members WHERE group_id = $1 AND dynamic`, [id])
  }
  if (Array.isArray(body?.device_ids)) {
    await db.query(`DELETE FROM monitoring.device_group_members WHERE group_id = $1 AND NOT dynamic`, [id])
    for (const did of body.device_ids) {
      await db.query(
        `INSERT INTO monitoring.device_group_members (group_id, device_id, dynamic) VALUES ($1,$2,false)
         ON CONFLICT DO NOTHING`,
        [id, Number(did)]
      )
    }
  }
  await refreshGroupMembership(db, id)

  await auditMonitoring(user.username, 'group.update', String(id))
  return { id, updated: true }
})
