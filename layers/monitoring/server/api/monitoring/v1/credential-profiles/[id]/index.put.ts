import { requireMonitoring } from '../../../../../utils/monitoringAuth'
import { monDb, idParam, notFound, auditMonitoring, badRequest } from '../../../../../utils/monApi'
import { normalizeCredentialProfileInput } from '../../../../../utils/credentialProfileInput'

/** PUT /api/monitoring/v1/credential-profiles/:id — update a credential profile (admin tier). */
export default defineEventHandler(async (event) => {
  const user = await requireMonitoring(event, 'admin')
  const db = await monDb()
  const id = idParam(event)
  const body = await readBody(event)

  const exists = await db.query(`SELECT id FROM monitoring.credential_profiles WHERE id = $1`, [id])
  if (!exists.rows.length) notFound('credential profile')

  const values = normalizeCredentialProfileInput(body, false)
  if (!Object.keys(values).length) badRequest('no updatable fields provided')

  const cols = Object.keys(values)
  const sets = cols.map((c, i) => `${c} = $${i + 2}`)
  await db.query(
    `UPDATE monitoring.credential_profiles SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`,
    [id, ...Object.values(values)]
  )
  await auditMonitoring(user.username, 'credential_profile.update', String(id), `fields=${cols.join(',')}`)
  return { id, updated: cols }
})
