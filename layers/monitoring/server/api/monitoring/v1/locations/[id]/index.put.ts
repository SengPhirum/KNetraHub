import { requireMonitoring } from '../../../../../utils/monitoringAuth'
import { monDb, idParam, auditMonitoring, badRequest, conflict, notFound } from '../../../../../utils/monApi'

/** PUT /api/monitoring/v1/locations/:id — update a location (admin). */
export default defineEventHandler(async (event) => {
  const user = await requireMonitoring(event, 'admin')
  const db = await monDb()
  const id = idParam(event)
  const body = await readBody(event)

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
  if (body?.latitude !== undefined) {
    const latitude = body.latitude != null && body.latitude !== '' ? Number(body.latitude) : null
    if (latitude != null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) badRequest('latitude must be between -90 and 90')
    set('latitude', latitude)
  }
  if (body?.longitude !== undefined) {
    const longitude = body.longitude != null && body.longitude !== '' ? Number(body.longitude) : null
    if (longitude != null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) badRequest('longitude must be between -180 and 180')
    set('longitude', longitude)
  }
  // A manually edited location is no longer purely sysLocation-derived.
  set('from_sys_location', false)

  try {
    const res = await db.query(`UPDATE monitoring.locations SET ${sets.join(', ')} WHERE id = $1 RETURNING id`, args)
    if (!res.rowCount) notFound('location')
  } catch (err: any) {
    if (err?.code === '23505') conflict('a location with that name already exists')
    throw err
  }
  await auditMonitoring(user.username, 'location.update', String(id))
  return { id, updated: true }
})
