import type { Pool } from 'pg'

/** Append one row to the monitoring event log. Never throws. */
export async function recordEvent(db: Pool, evt: {
  deviceId?: number | null
  entityType?: string | null
  entityId?: number | null
  eventType: string
  severity?: 'info' | 'warning' | 'error'
  message: string
  detail?: Record<string, unknown>
}): Promise<number | null> {
  try {
    const res = await db.query(
      `INSERT INTO monitoring.events (device_id, entity_type, entity_id, event_type, severity, message, detail)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [evt.deviceId ?? null, evt.entityType ?? null, evt.entityId ?? null, evt.eventType,
        evt.severity ?? 'info', evt.message, evt.detail ? JSON.stringify(evt.detail) : null]
    )
    return Number(res.rows[0]?.id ?? null)
  } catch (err) {
    console.error('[monitoring:events] failed to record event', err)
    return null
  }
}
