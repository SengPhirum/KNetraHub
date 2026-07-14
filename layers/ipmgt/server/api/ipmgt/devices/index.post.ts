import { nanoid } from 'nanoid'
import { getDb } from '~~/server/utils/db'
import { requireIpam, ipamAudit, normalizeDeviceStatus } from '~~/layers/ipmgt/server/utils/ipamStore'
import { encryptSecret } from '~~/server/utils/secretCrypto'

export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'operator')
  const body = await readBody(event)
  const hostname = String(body?.hostname || '').trim()
  if (!hostname) throw createError({ statusCode: 400, statusMessage: 'Hostname is required' })
  const id = nanoid()
  await getDb().query(
    `INSERT INTO ipmgt_devices (
      id, hostname, display_name, description, device_type, vendor, model,
      serial_number, asset_number, management_ip, location_id, customer_id,
      snmp_version, snmp_community_enc, snmp_sec_level, snmp_auth_user, snmp_auth_protocol,
      snmp_auth_password_enc, snmp_priv_protocol, snmp_priv_password_enc,
      status, notes, created_at, created_by
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)`,
    [
      id, hostname, body.display_name || null, body.description || null,
      body.device_type || null, body.vendor || null, body.model || null,
      body.serial_number || null, body.asset_number || null, body.management_ip || null,
      body.location_id || null, body.customer_id || null,
      body.snmp_version || null,
      body.snmp_community ? encryptSecret(body.snmp_community) : null,
      body.snmp_sec_level || null, body.snmp_auth_user || null, body.snmp_auth_protocol || null,
      body.snmp_auth_password ? encryptSecret(body.snmp_auth_password) : null,
      body.snmp_priv_protocol || null,
      body.snmp_priv_password ? encryptSecret(body.snmp_priv_password) : null,
      normalizeDeviceStatus(body.status), body.notes || null,
      new Date().toISOString(), user.username
    ]
  )
  await ipamAudit(user, 'ipmgt.device.create', id, { hostname })
  return { id }
})
