import { requireMonitoring } from '../../../../utils/monitoringAuth'
import { monDb, auditMonitoring, badRequest, conflict } from '../../../../utils/monApi'

/** POST /api/monitoring/v1/locations — create a location (admin). */
export default defineEventHandler(async (event) => {
  const user = await requireMonitoring(event, 'admin')
  const db = await monDb()
  const body = await readBody(event)

  const name = String(body?.name ?? '').trim()
  if (!name) badRequest('name is required')
  const latitude = body?.latitude != null && body.latitude !== '' ? Number(body.latitude) : null
  const longitude = body?.longitude != null && body.longitude !== '' ? Number(body.longitude) : null
  if (latitude != null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) badRequest('latitude must be between -90 and 90')
  if (longitude != null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) badRequest('longitude must be between -180 and 180')

  try {
    const res = await db.query(
      `INSERT INTO monitoring.locations (name, latitude, longitude) VALUES ($1,$2,$3) RETURNING id`,
      [name, latitude, longitude]
    )
    await auditMonitoring(user.username, 'location.create', String(res.rows[0].id), `name=${name}`)
    setResponseStatus(event, 201)
    return { id: Number(res.rows[0].id) }
  } catch (err: any) {
    if (err?.code === '23505') conflict(`a location named "${name}" already exists`)
    throw err
  }
})
