import { getDb } from '~~/server/utils/db'
import { requireIpam, ipamAudit, normalizeDeviceStatus } from '~~/layers/ipmgt/server/utils/ipamStore'
import { encryptSecret } from '~~/server/utils/secretCrypto'

// Blank SNMP secret fields keep the current stored value - GET responses
// never include them (see stripDeviceSnmpSecrets), so the form submits them
// empty unless the user typed a replacement.
export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'operator')
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const db = getDb()
  const cur = await db.query('SELECT * FROM ipmgt_devices WHERE id = $1', [id])
  if (!cur.rows.length) throw createError({ statusCode: 404, statusMessage: 'Device not found' })
  const row = cur.rows[0]
  const hostname = body.hostname !== undefined ? String(body.hostname).trim() : row.hostname
  if (!hostname) throw createError({ statusCode: 400, statusMessage: 'Hostname is required' })

  await db.query(
    `UPDATE ipmgt_devices SET
       hostname = $2, display_name = $3, description = $4, device_type = $5, vendor = $6, model = $7,
       serial_number = $8, asset_number = $9, management_ip = $10, location_id = $11, customer_id = $12,
       snmp_version = $13, snmp_community_enc = COALESCE($14, snmp_community_enc),
       snmp_sec_level = $15, snmp_auth_user = $16, snmp_auth_protocol = $17,
       snmp_auth_password_enc = COALESCE($18, snmp_auth_password_enc),
       snmp_priv_protocol = $19, snmp_priv_password_enc = COALESCE($20, snmp_priv_password_enc),
       status = $21, notes = $22, updated_at = $23, updated_by = $24
     WHERE id = $1`,
    [
      id, hostname,
      body.display_name === undefined ? row.display_name : body.display_name,
      body.description === undefined ? row.description : body.description,
      body.device_type === undefined ? row.device_type : body.device_type,
      body.vendor === undefined ? row.vendor : body.vendor,
      body.model === undefined ? row.model : body.model,
      body.serial_number === undefined ? row.serial_number : body.serial_number,
      body.asset_number === undefined ? row.asset_number : body.asset_number,
      body.management_ip === undefined ? row.management_ip : body.management_ip,
      body.location_id === undefined ? row.location_id : (body.location_id || null),
      body.customer_id === undefined ? row.customer_id : (body.customer_id || null),
      body.snmp_version === undefined ? row.snmp_version : body.snmp_version,
      body.snmp_community ? encryptSecret(body.snmp_community) : null,
      body.snmp_sec_level === undefined ? row.snmp_sec_level : body.snmp_sec_level,
      body.snmp_auth_user === undefined ? row.snmp_auth_user : body.snmp_auth_user,
      body.snmp_auth_protocol === undefined ? row.snmp_auth_protocol : body.snmp_auth_protocol,
      body.snmp_auth_password ? encryptSecret(body.snmp_auth_password) : null,
      body.snmp_priv_protocol === undefined ? row.snmp_priv_protocol : body.snmp_priv_protocol,
      body.snmp_priv_password ? encryptSecret(body.snmp_priv_password) : null,
      body.status === undefined ? row.status : normalizeDeviceStatus(body.status),
      body.notes === undefined ? row.notes : body.notes,
      new Date().toISOString(), user.username
    ]
  )
  await ipamAudit(user, 'ipmgt.device.update', id, { hostname })
  return { id }
})
