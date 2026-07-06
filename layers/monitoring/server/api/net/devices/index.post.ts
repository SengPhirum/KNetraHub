import { getDb } from '~~/server/utils/db'
import { nanoid } from 'nanoid'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const db = getDb()
  
  const id = nanoid()
  const now = new Date().toISOString()
  
  await db.query(`
    INSERT INTO net_devices
    (id, hostname, ip, type, vendor, os, status, uptime, snmp_version, snmp_community, poll_method, category, created_at,
     snmp_sec_level, snmp_auth_user, snmp_auth_protocol, snmp_auth_password, snmp_priv_protocol, snmp_priv_password)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
  `, [
    id,
    body.hostname,
    body.ip,
    body.type || 'Unknown',
    body.vendor || 'Unknown',
    body.os || 'Unknown',
    'unknown',
    '0 days',
    body.snmp_version || null,
    body.snmp_community || null,
    body.poll_method || 'ping',
    body.category || 'network',
    now,
    body.snmp_sec_level || null,
    body.snmp_auth_user || null,
    body.snmp_auth_protocol || null,
    body.snmp_auth_password || null,
    body.snmp_priv_protocol || null,
    body.snmp_priv_password || null
  ])

  if (body.group_id) {
    await db.query(
      'INSERT INTO net_device_groups (device_id, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [id, body.group_id]
    )
  }

  return { id }
})
