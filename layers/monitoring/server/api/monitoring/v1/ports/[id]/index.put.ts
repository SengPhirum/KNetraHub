import { requireMonitoring } from '../../../../../utils/monitoringAuth'
import { monDb, idParam, auditMonitoring, badRequest, notFound } from '../../../../../utils/monApi'

/**
 * PUT /api/monitoring/v1/ports/:id — port admin flags (admin tier).
 * Body: { disabled?, ignored? } — disabled stops counter polling entirely;
 * ignored keeps polling but excludes the port from events/alerting.
 */
export default defineEventHandler(async (event) => {
  const user = await requireMonitoring(event, 'admin')
  const db = await monDb()
  const id = idParam(event)
  const body = await readBody(event)

  const sets: string[] = []
  const args: unknown[] = [id]
  if (body?.disabled !== undefined) {
    args.push(!!body.disabled)
    sets.push(`disabled = $${args.length}`)
  }
  if (body?.ignored !== undefined) {
    args.push(!!body.ignored)
    sets.push(`ignored = $${args.length}`)
  }
  if (!sets.length) badRequest('nothing to update (disabled/ignored)')

  const res = await db.query(
    `UPDATE monitoring.ports SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 RETURNING device_id, if_index`,
    args
  )
  if (!res.rowCount) notFound('port')
  await auditMonitoring(user.username, 'port.update', String(id),
    `device=${res.rows[0].device_id} ifIndex=${res.rows[0].if_index} ${sets.join(' ')}`)
  return { id, updated: true }
})
