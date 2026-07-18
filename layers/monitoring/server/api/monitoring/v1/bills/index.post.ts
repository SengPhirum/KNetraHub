import { requireMonitoring } from '../../../../utils/monitoringAuth'
import { monDb, auditMonitoring, badRequest, conflict } from '../../../../utils/monApi'

/** Validate a bill create/update body. */
export function normalizeBillBody(body: any): Record<string, unknown> {
  const name = String(body?.name ?? '').trim()
  if (!name) badRequest('name is required')
  const billType = body?.bill_type === 'cdr' ? 'cdr' : 'quota'
  const direction = ['in', 'out', 'max', 'sum'].includes(body?.direction) ? body.direction : 'sum'
  const quotaBytes = body?.quota_bytes != null && body.quota_bytes !== '' ? Number(body.quota_bytes) : null
  const cdrBps = body?.cdr_bps != null && body.cdr_bps !== '' ? Number(body.cdr_bps) : null
  if (billType === 'quota' && (quotaBytes == null || quotaBytes <= 0)) badRequest('quota bills need quota_bytes > 0')
  if (billType === 'cdr' && (cdrBps == null || cdrBps <= 0)) badRequest('cdr bills need cdr_bps > 0')
  const billDay = Math.min(28, Math.max(1, Number(body?.bill_day) || 1))
  return {
    name,
    bill_type: billType,
    direction,
    quota_bytes: quotaBytes,
    cdr_bps: cdrBps,
    bill_day: billDay,
    timezone: body?.timezone ? String(body.timezone).slice(0, 64) : 'UTC',
    contact: body?.contact ? String(body.contact).slice(0, 255) : null,
    notes: body?.notes ? String(body.notes).slice(0, 4000) : null
  }
}

export async function setBillPorts(db: any, billId: number, portIds: unknown): Promise<void> {
  if (!Array.isArray(portIds)) return
  await db.query(`DELETE FROM monitoring.bill_ports WHERE bill_id = $1`, [billId])
  for (const pid of portIds) {
    await db.query(
      `INSERT INTO monitoring.bill_ports (bill_id, port_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [billId, Number(pid)]
    )
  }
}

/** POST /api/monitoring/v1/bills — create a traffic bill (admin). */
export default defineEventHandler(async (event) => {
  const user = await requireMonitoring(event, 'admin')
  const db = await monDb()
  const body = await readBody(event)
  const b = normalizeBillBody(body)

  try {
    const res = await db.query(
      `INSERT INTO monitoring.bills (name, bill_type, direction, quota_bytes, cdr_bps, bill_day, timezone, contact, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [b.name, b.bill_type, b.direction, b.quota_bytes, b.cdr_bps, b.bill_day, b.timezone, b.contact, b.notes]
    )
    const id = Number(res.rows[0].id)
    await setBillPorts(db, id, body?.port_ids)
    await auditMonitoring(user.username, 'bill.create', String(id), `name=${b.name}`)
    setResponseStatus(event, 201)
    return { id }
  } catch (err: any) {
    if (err?.code === '23505') conflict(`a bill named "${b.name}" already exists`)
    throw err
  }
})
