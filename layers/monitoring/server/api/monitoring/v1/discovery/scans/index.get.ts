import { requireMonitoring } from '../../../../../utils/monitoringAuth'
import { monDb } from '../../../../../utils/monApi'

/** GET /api/monitoring/v1/discovery/scans — recent CIDR scans, newest first. */
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'viewer')
  const db = await monDb()
  const rows = await db.query(
    `SELECT id, cidr, poller_group, requested_by, status, total_hosts, scanned_hosts, alive_hosts, error, created_at, finished_at
     FROM monitoring.discovery_scans ORDER BY created_at DESC LIMIT 20`
  )
  return { items: rows.rows }
})
