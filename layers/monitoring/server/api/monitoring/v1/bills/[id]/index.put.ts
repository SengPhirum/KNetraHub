import { requireMonitoring } from '../../../../../utils/monitoringAuth'
import { monDb, idParam, auditMonitoring, conflict, notFound } from '../../../../../utils/monApi'
import { normalizeBillBody, setBillPorts } from '../index.post'

/** PUT /api/monitoring/v1/bills/:id — replace a bill (admin). */
export default defineEventHandler(async (event) => {
  const user = await requireMonitoring(event, 'admin')
  const db = await monDb()
  const id = idParam(event)
  const body = await readBody(event)
  const b = normalizeBillBody(body)

  try {
    const res = await db.query(
      `UPDATE monitoring.bills SET name = $2, bill_type = $3, direction = $4, quota_bytes = $5,
         cdr_bps = $6, bill_day = $7, timezone = $8, contact = $9, notes = $10
       WHERE id = $1 RETURNING id`,
      [id, b.name, b.bill_type, b.direction, b.quota_bytes, b.cdr_bps, b.bill_day, b.timezone, b.contact, b.notes]
    )
    if (!res.rowCount) notFound('bill')
  } catch (err: any) {
    if (err?.code === '23505') conflict('a bill with that name already exists')
    throw err
  }
  await setBillPorts(db, id, body?.port_ids)
  await auditMonitoring(user.username, 'bill.update', String(id), `name=${b.name}`)
  return { id, updated: true }
})
