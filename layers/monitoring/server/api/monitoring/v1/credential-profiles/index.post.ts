import { requireMonitoring } from '../../../../utils/monitoringAuth'
import { monDb, auditMonitoring, badRequest } from '../../../../utils/monApi'
import { normalizeCredentialProfileInput } from '../../../../utils/credentialProfileInput'

/**
 * POST /api/monitoring/v1/credential-profiles — add a reusable SNMP
 * credential set (admin tier). Discovery tries every profile, in
 * attempt_order, against a device with no device-specific SNMP config —
 * the LibreNMS "community list" equivalent.
 */
export default defineEventHandler(async (event) => {
  const user = await requireMonitoring(event, 'admin')
  const db = await monDb()
  const body = await readBody(event)
  const values = normalizeCredentialProfileInput(body, true)

  const dupe = await db.query(`SELECT id FROM monitoring.credential_profiles WHERE lower(name) = lower($1)`, [values.name])
  if (dupe.rows.length) badRequest(`a credential profile named "${values.name}" already exists`)

  const cols = Object.keys(values)
  const placeholders = cols.map((_, i) => `$${i + 1}`)
  const res = await db.query(
    `INSERT INTO monitoring.credential_profiles (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING id, name`,
    Object.values(values)
  )
  await auditMonitoring(user.username, 'credential_profile.create', String(res.rows[0].id), `name=${res.rows[0].name}`)

  setResponseStatus(event, 201)
  return { id: Number(res.rows[0].id), name: res.rows[0].name }
})
