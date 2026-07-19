import { getIpamDb as getDb } from '~~/server/utils/moduleDb'
import { requireIpam, ipamAudit } from '~~/layers/ipmgt/server/utils/ipamStore'
import { getIpamSnmpSystem } from '~~/layers/ipmgt/server/utils/ipamSnmpClient'
import { decryptSecret } from '~~/server/utils/secretCrypto'

// Test SNMP connectivity using the device's stored (encrypted) credentials.
// Decrypts just-in-time for this one call; never returns the credentials.
export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'operator')
  const id = getRouterParam(event, 'id')!
  const { rows } = await getDb().query('SELECT * FROM ipmgt_devices WHERE id = $1', [id])
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Device not found' })
  const dev = rows[0]
  if (!dev.management_ip) throw createError({ statusCode: 400, statusMessage: 'Device has no management IP configured' })

  const opts = {
    community: decryptSecret(dev.snmp_community_enc) || undefined,
    version: dev.snmp_version || 'v2c',
    secLevel: dev.snmp_sec_level || undefined,
    authUser: dev.snmp_auth_user || undefined,
    authProtocol: dev.snmp_auth_protocol || undefined,
    authPassword: decryptSecret(dev.snmp_auth_password_enc) || undefined,
    privProtocol: dev.snmp_priv_protocol || undefined,
    privPassword: decryptSecret(dev.snmp_priv_password_enc) || undefined,
    timeoutMs: 3000
  }

  try {
    const sys = await getIpamSnmpSystem(dev.management_ip, opts)
    await ipamAudit(user, 'ipmgt.device.snmp_test', id, { hostname: dev.hostname, ok: true })
    return { ok: true, ...sys }
  } catch (err: any) {
    await ipamAudit(user, 'ipmgt.device.snmp_test', id, { hostname: dev.hostname, ok: false })
    throw createError({ statusCode: 502, statusMessage: `SNMP test failed: ${err?.message || 'no response'}` })
  }
})
