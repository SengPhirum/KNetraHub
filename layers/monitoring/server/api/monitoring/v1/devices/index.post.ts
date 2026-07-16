import { requireMonitoring } from '../../../../utils/monitoringAuth'
import { monDb, auditMonitoring, badRequest } from '../../../../utils/monApi'
import { normalizeDeviceInput } from '../../../../utils/deviceInput'
import { enqueue } from '../../../../jobs/queue'

/**
 * POST /api/monitoring/v1/devices — add a device (admin tier).
 * Body: hostname (required) + optional SNMP/credential/location fields.
 * force=true skips the reachability preflight. Discovery is queued
 * immediately so the device populates without waiting for the next cycle.
 */
export default defineEventHandler(async (event) => {
  const user = await requireMonitoring(event, 'admin')
  const db = await monDb()
  const body = await readBody(event)
  const values = normalizeDeviceInput(body, true)

  const dupe = await db.query(`SELECT id FROM monitoring.devices WHERE lower(hostname) = lower($1)`, [values.hostname])
  if (dupe.rows.length) badRequest(`a device with hostname "${values.hostname}" already exists`)

  const cols = Object.keys(values)
  const placeholders = cols.map((_, i) => `$${i + 1}`)
  const res = await db.query(
    `INSERT INTO monitoring.devices (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING id, hostname`,
    Object.values(values)
  )
  const device = res.rows[0]

  await enqueue(db, { type: 'discovery', deviceId: Number(device.id), dedupeKey: `discovery:${device.id}`, priority: 10 })
  await auditMonitoring(user.username, 'device.create', String(device.id), `hostname=${device.hostname}`)

  setResponseStatus(event, 201)
  return { id: Number(device.id), hostname: device.hostname, queued_discovery: true }
})
