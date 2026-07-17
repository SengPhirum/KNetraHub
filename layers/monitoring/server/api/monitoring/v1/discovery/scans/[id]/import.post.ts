import { requireMonitoring } from '../../../../../../utils/monitoringAuth'
import { monDb, idParam, notFound, badRequest, auditMonitoring } from '../../../../../../utils/monApi'
import { enqueue } from '../../../../../../jobs/queue'

/**
 * POST /api/monitoring/v1/discovery/scans/:id/import — create devices from
 * selected scan candidates (operator tier). Body: { candidate_ids: number[] }
 * or { all_alive: true } to import every alive, not-already-existing
 * candidate from the scan. This is the only place a CIDR scan actually
 * writes to monitoring.devices — the scan itself never does.
 */
export default defineEventHandler(async (event) => {
  const user = await requireMonitoring(event, 'operator')
  const db = await monDb()
  const scanId = idParam(event)
  const body = await readBody(event)

  const scanRes = await db.query(`SELECT * FROM monitoring.discovery_scans WHERE id = $1`, [scanId])
  if (!scanRes.rows.length) notFound('scan')
  const scan = scanRes.rows[0]

  const candidateIds: number[] = Array.isArray(body?.candidate_ids) ? body.candidate_ids.map(Number).filter(Number.isInteger) : []
  const allAlive = !!body?.all_alive
  if (!candidateIds.length && !allAlive) badRequest('candidate_ids (non-empty) or all_alive is required')

  const candidatesRes = allAlive
    ? await db.query(
        `SELECT id, host(ip) AS ip FROM monitoring.discovery_candidates
         WHERE scan_id = $1 AND alive AND NOT already_exists AND NOT imported`,
        [scanId]
      )
    : await db.query(
        `SELECT id, host(ip) AS ip FROM monitoring.discovery_candidates
         WHERE scan_id = $1 AND id = ANY($2::bigint[]) AND NOT already_exists AND NOT imported`,
        [scanId, candidateIds]
      )

  let imported = 0
  let skippedExisting = 0
  for (const candidate of candidatesRes.rows) {
    const host = candidate.ip as string
    const exists = await db.query(
      `SELECT id FROM monitoring.devices WHERE ip = $1::inet OR hostname = $2`,
      [host, host]
    )
    if (exists.rows.length) {
      await db.query(
        `UPDATE monitoring.discovery_candidates SET already_exists = true, existing_device_id = $2 WHERE id = $1`,
        [candidate.id, Number(exists.rows[0].id)]
      )
      skippedExisting++
      continue
    }
    const res = await db.query(
      `INSERT INTO monitoring.devices (hostname, ip, credential_profile_id, poller_group, status)
       VALUES ($1,$2::inet,$3,$4,'pending') RETURNING id`,
      [host, host, scan.credential_profile_id, scan.poller_group]
    )
    const deviceId = Number(res.rows[0].id)
    await enqueue(db, { type: 'discovery', deviceId, pollerGroup: Number(scan.poller_group), dedupeKey: `discovery:${deviceId}`, priority: 30 })
    await db.query(
      `UPDATE monitoring.discovery_candidates SET imported = true, imported_device_id = $2 WHERE id = $1`,
      [candidate.id, deviceId]
    )
    imported++
  }

  await auditMonitoring(user.username, 'discovery.scan.import', String(scanId), `imported=${imported} skipped_existing=${skippedExisting}`)
  return { scan_id: scanId, selected: candidatesRes.rows.length, imported, skipped_existing: skippedExisting }
})
