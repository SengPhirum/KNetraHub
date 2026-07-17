import { requireMonitoring } from '../../../../../../utils/monitoringAuth'
import { monDb, idParam, notFound } from '../../../../../../utils/monApi'

/** GET /api/monitoring/v1/discovery/scans/:id — scan status/progress. */
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'viewer')
  const db = await monDb()
  const id = idParam(event)
  const res = await db.query(
    `SELECT id, cidr, poller_group, credential_profile_id, exclude, requested_by, status,
            total_hosts, scanned_hosts, alive_hosts, error, created_at, finished_at
     FROM monitoring.discovery_scans WHERE id = $1`,
    [id]
  )
  if (!res.rows.length) notFound('scan')
  return res.rows[0]
})
