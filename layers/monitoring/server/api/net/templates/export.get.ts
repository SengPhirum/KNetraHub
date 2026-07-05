import { getDb } from '~~/server/utils/db'

// All device templates as JSON, for Settings > Templates > Export. SNMP
// passwords are excluded (a re-imported template needs credentials re-entered).
export default defineEventHandler(async () => {
  const db = getDb()
  const res = await db.query(`
    SELECT name, description, category, poll_method, snmp_version, snmp_community,
           snmp_sec_level, snmp_auth_user, snmp_auth_protocol, snmp_priv_protocol
    FROM net_device_templates ORDER BY name ASC
  `)
  return res.rows
})
