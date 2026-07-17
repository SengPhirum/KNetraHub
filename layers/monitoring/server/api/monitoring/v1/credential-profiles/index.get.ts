import { requireMonitoring } from '../../../../utils/monitoringAuth'
import { monDb } from '../../../../utils/monApi'
import { stripCredentials } from '../../../../core/credentials'

/** GET /api/monitoring/v1/credential-profiles — SNMP credential profiles, attempt order first. */
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'viewer')
  const db = await monDb()
  const rows = await db.query(`SELECT * FROM monitoring.credential_profiles ORDER BY attempt_order ASC, name ASC`)
  return { items: rows.rows.map((r: any) => stripCredentials(r)) }
})
