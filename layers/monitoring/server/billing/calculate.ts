import { getDb } from '~~/server/utils/db'
import { percentile95 } from '../core/counters'

/**
 * Traffic billing (quota + 95th percentile) over selected ports, computed
 * from monitoring.port_metrics octet deltas / bps samples. Runs every minute
 * as a singleton queue job; each run refreshes the current period row in
 * monitoring.bill_history and closes finished periods.
 *
 * Correctness notes: octet deltas are already rollover/reboot-safe (the port
 * poller rejects invalid deltas), so summing deltas is gap-tolerant — missed
 * polls simply contribute nothing rather than spikes.
 */
export async function calculateBills(): Promise<void> {
  const db = getDb()
  const bills = await db.query(`SELECT * FROM monitoring.bills`)
  for (const bill of bills.rows) {
    try {
      await calculateBill(db, bill)
    } catch (err) {
      console.error(`[monitoring:billing] bill "${bill.name}" failed`, err)
    }
  }
}

export function periodBounds(billDay: number, now = new Date()): { start: Date; end: Date } {
  const day = Math.min(Math.max(1, billDay), 28)
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day))
  if (now < start) start.setUTCMonth(start.getUTCMonth() - 1)
  const end = new Date(start)
  end.setUTCMonth(end.getUTCMonth() + 1)
  return { start, end }
}

async function calculateBill(db: ReturnType<typeof getDb>, bill: any): Promise<void> {
  const ports = await db.query(`SELECT port_id FROM monitoring.bill_ports WHERE bill_id = $1`, [bill.id])
  if (!ports.rows.length) return
  const portIds = ports.rows.map((r: any) => Number(r.port_id))
  const { start, end } = periodBounds(Number(bill.bill_day ?? 1))

  const totals = await db.query(
    `SELECT COALESCE(SUM(in_octets_delta),0) AS in_bytes, COALESCE(SUM(out_octets_delta),0) AS out_bytes
     FROM monitoring.port_metrics WHERE port_id = ANY($1::bigint[]) AND time >= $2 AND time < $3`,
    [portIds, start, end]
  )
  const inBytes = Number(totals.rows[0].in_bytes ?? 0)
  const outBytes = Number(totals.rows[0].out_bytes ?? 0)
  const totalBytes =
    bill.direction === 'in' ? inBytes
    : bill.direction === 'out' ? outBytes
    : bill.direction === 'max' ? Math.max(inBytes, outBytes)
    : inBytes + outBytes

  // 95th percentile over 5-minute aggregate bps samples (in+out per bucket,
  // direction-aware like the total).
  let p95: number | null = null
  if (bill.bill_type === 'cdr') {
    const samples = await db.query(
      `SELECT time_bucket('5 minutes', time) AS bucket,
              avg(in_bps) AS in_bps, avg(out_bps) AS out_bps
       FROM monitoring.port_metrics
       WHERE port_id = ANY($1::bigint[]) AND time >= $2 AND time < $3
       GROUP BY bucket`,
      [portIds, start, end]
    )
    const values = samples.rows.map((r: any) => {
      const i = Number(r.in_bps ?? 0)
      const o = Number(r.out_bps ?? 0)
      return bill.direction === 'in' ? i : bill.direction === 'out' ? o : Math.max(i, o)
    })
    p95 = percentile95(values)
  }

  const overage = bill.bill_type === 'quota' && bill.quota_bytes != null
    ? Math.max(0, totalBytes - Number(bill.quota_bytes))
    : null

  await db.query(
    `INSERT INTO monitoring.bill_history (bill_id, period_start, period_end, in_bytes, out_bytes, total_bytes, percentile_95_bps, overage_bytes, closed)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,false)
     ON CONFLICT (bill_id, period_start) DO UPDATE SET
       in_bytes = $4, out_bytes = $5, total_bytes = $6, percentile_95_bps = $7, overage_bytes = $8`,
    [bill.id, start, end, inBytes, outBytes, totalBytes, p95, overage]
  )

  // Close any prior periods still open.
  await db.query(
    `UPDATE monitoring.bill_history SET closed = true WHERE bill_id = $1 AND period_end <= now() AND NOT closed`,
    [bill.id]
  )
}
