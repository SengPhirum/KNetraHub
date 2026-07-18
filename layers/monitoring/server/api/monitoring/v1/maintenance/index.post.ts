import { requireMonitoring } from '../../../../utils/monitoringAuth'
import { monDb, auditMonitoring, badRequest } from '../../../../utils/monApi'

const BEHAVIORS = ['skip_alerts', 'skip_polling']
const RECURRENCES = ['daily', 'weekly', 'monthly']

export interface MaintenanceTargetInput {
  device_id?: number
  group_id?: number
  location_id?: number
}

export function normalizeTargets(raw: unknown): MaintenanceTargetInput[] {
  if (!Array.isArray(raw) || !raw.length) badRequest('at least one target (device/group/location) is required')
  const targets: MaintenanceTargetInput[] = []
  for (const t of raw as any[]) {
    const keys = ['device_id', 'group_id', 'location_id'].filter((k) => t?.[k] != null)
    if (keys.length !== 1) badRequest('each target must set exactly one of device_id, group_id, location_id')
    targets.push({ [keys[0]!]: Number(t[keys[0]!]) })
  }
  return targets
}

export function normalizeWindow(body: any): { title: string; notes: string | null; startsAt: Date; endsAt: Date; behavior: string; recurrence: string | null } {
  const title = String(body?.title ?? '').trim()
  if (!title) badRequest('title is required')
  const startsAt = new Date(body?.starts_at)
  const endsAt = new Date(body?.ends_at)
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) badRequest('starts_at and ends_at must be valid timestamps')
  if (endsAt <= startsAt) badRequest('ends_at must be after starts_at')
  const behavior = BEHAVIORS.includes(body?.behavior) ? body.behavior : 'skip_alerts'
  const recurrence = body?.recurrence ? String(body.recurrence) : null
  if (recurrence && !RECURRENCES.includes(recurrence)) badRequest(`recurrence must be one of ${RECURRENCES.join(', ')}`)
  if (recurrence === 'daily' && endsAt.getTime() - startsAt.getTime() >= 86400000) badRequest('a daily-recurring window must be shorter than 24h')
  return { title, notes: body?.notes ? String(body.notes).slice(0, 4000) : null, startsAt, endsAt, behavior, recurrence }
}

/** POST /api/monitoring/v1/maintenance — create a window (operator tier). */
export default defineEventHandler(async (event) => {
  const user = await requireMonitoring(event, 'operator')
  const db = await monDb()
  const body = await readBody(event)

  const w = normalizeWindow(body)
  const targets = normalizeTargets(body?.targets)

  const res = await db.query(
    `INSERT INTO monitoring.maintenance_windows (title, notes, starts_at, ends_at, behavior, recurrence, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [w.title, w.notes, w.startsAt, w.endsAt, w.behavior, w.recurrence, user.username]
  )
  const id = Number(res.rows[0].id)
  for (const t of targets) {
    await db.query(
      `INSERT INTO monitoring.maintenance_targets (window_id, device_id, group_id, location_id) VALUES ($1,$2,$3,$4)`,
      [id, t.device_id ?? null, t.group_id ?? null, t.location_id ?? null]
    )
  }
  await auditMonitoring(user.username, 'maintenance.create', String(id), `title=${w.title}`)
  setResponseStatus(event, 201)
  return { id }
})
