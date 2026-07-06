import { getDb } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)
  const db = getDb()
  
  await db.query(`
    UPDATE net_devices
    SET hostname = $1, ip = $2, snmp_version = $3, snmp_community = $4, poll_method = $5, category = $6,
        snmp_sec_level = $7, snmp_auth_user = $8, snmp_auth_protocol = $9, snmp_auth_password = $10,
        snmp_priv_protocol = $11, snmp_priv_password = $12, type = $13
    WHERE id = $14
  `, [
    body.hostname,
    body.ip,
    body.snmp_version || null,
    body.snmp_community || null,
    body.poll_method || 'ping',
    body.category || 'network',
    body.snmp_sec_level || null,
    body.snmp_auth_user || null,
    body.snmp_auth_protocol || null,
    body.snmp_auth_password || null,
    body.snmp_priv_protocol || null,
    body.snmp_priv_password || null,
    body.type || 'Unknown',
    id
  ])
  
  return { success: true }
})
