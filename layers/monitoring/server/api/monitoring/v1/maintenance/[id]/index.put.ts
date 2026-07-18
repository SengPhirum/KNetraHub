import { requireMonitoring } from '../../../../../utils/monitoringAuth'
import { monDb, idParam, auditMonitoring, notFound } from '../../../../../utils/monApi'
import { normalizeWindow, normalizeTargets } from '../index.post'

/** PUT /api/monitoring/v1/maintenance/:id — replace a window (operator tier). */
export default defineEventHandler(async (event) => {
  const user = await requireMonitoring(event, 'operator')
  const db = await monDb()
  const id = idParam(event)
  const body = await readBody(event)

  const existing = await db.query(`SELECT id FROM monitoring.maintenance_windows WHERE id = $1`, [id])
  if (!existing.rows.length) notFound('maintenance window')

  const w = normalizeWindow(body)
  const targets = normalizeTargets(body?.targets)

  await db.query(
    `UPDATE monitoring.maintenance_windows SET title = $2, notes = $3, starts_at = $4, ends_at = $5,
       behavior = $6, recurrence = $7 WHERE id = $1`,
    [id, w.title, w.notes, w.startsAt, w.endsAt, w.behavior, w.recurrence]
  )
  await db.query(`DELETE FROM monitoring.maintenance_targets WHERE window_id = $1`, [id])
  for (const t of targets) {
    await db.query(
      `INSERT INTO monitoring.maintenance_targets (window_id, device_id, group_id, location_id) VALUES ($1,$2,$3,$4)`,
      [id, t.device_id ?? null, t.group_id ?? null, t.location_id ?? null]
    )
  }
  await auditMonitoring(user.username, 'maintenance.update', String(id), `title=${w.title}`)
  return { id, updated: true }
})
