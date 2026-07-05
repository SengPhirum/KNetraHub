import { getDb } from '~~/server/utils/db'

// Full device inventory as JSON rows, for the Devices page's Export button.
// CSV conversion happens client-side (see app/utils/fileIO.ts) from this same
// payload, so there's one source of truth for the exported columns.
export default defineEventHandler(async () => {
  const db = getDb()
  const res = await db.query(`
    SELECT hostname, ip, type, vendor, os, category, poll_method,
           snmp_version, snmp_community, snmp_sec_level, snmp_auth_user,
           snmp_auth_protocol, snmp_priv_protocol
     FROM net_devices ORDER BY hostname ASC
  `)
  return res.rows
})
