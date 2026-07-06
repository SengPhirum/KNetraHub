import { getDb } from '~~/server/utils/db'

// Recent SNMP traps (server/plugins/trapReceiver.ts), newest first, with the
// matched host name when the source IP correlates to a known host.
export default defineEventHandler(async () => {
  const db = getDb()
  const { rows } = await db.query(`
    SELECT t.*, h.name AS host
    FROM server_traps t
    LEFT JOIN server_hosts h ON t.host_id = h.id
    ORDER BY t.received_at DESC
    LIMIT 500
  `)
  return rows
})
