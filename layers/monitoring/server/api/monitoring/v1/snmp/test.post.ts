import { requireMonitoring } from '../../../../utils/monitoringAuth'
import { monDb, badRequest, notFound } from '../../../../utils/monApi'
import { resolveSnmpConfig } from '../../../../core/credentials'
import { testIcmp, testSnmp, buildInlineSnmpConfig, loadDecryptedProfile, type InlineSnmpInput } from '../../../../snmp/preflight'
import { SNMP_VERSIONS, type SnmpVersion } from '../../../../../shared/constants'

/**
 * POST /api/monitoring/v1/snmp/test — connectivity/query test (nothing is
 * persisted). Two modes:
 *
 *  - `{ device_id }` (operator): test a saved device with its stored
 *    credentials — ICMP ping + SNMP GET of the system scalars, raw varbinds
 *    included in the response.
 *  - inline config (admin): `{ hostname, snmp_version, snmp_community | v3_*,
 *    snmp_port?, snmp_context?, credential_profile_id? }` — used by the
 *    Add-Device modal's "Test connection" before the device exists.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const deviceId = body?.device_id != null ? Number(body.device_id) : null
  await requireMonitoring(event, deviceId != null ? 'operator' : 'admin')
  const db = await monDb()
  const rc = useRuntimeConfig().monitoring as Record<string, any>
  const defaults = { timeoutMs: Number(rc.snmpTimeoutMs ?? 3000), retries: Number(rc.snmpRetries ?? 2) }

  let host: string
  let snmpPromise: ReturnType<typeof testSnmp> | Promise<null>

  if (deviceId != null) {
    if (!Number.isInteger(deviceId) || deviceId <= 0) badRequest('invalid device_id')
    const res = await db.query('SELECT * FROM monitoring.devices WHERE id = $1', [deviceId])
    const device = res.rows[0]
    if (!device) notFound('device')
    host = (device.ip as string | null) || device.hostname
    if (device.snmp_disabled) {
      snmpPromise = Promise.resolve(null)
    } else {
      const cfg = await resolveSnmpConfig(db, device)
      if (!cfg) badRequest('device has no usable SNMP configuration (v3 without a username?)')
      snmpPromise = testSnmp(cfg)
    }
  } else {
    const hostname = String(body?.hostname ?? '').trim()
    if (!hostname || hostname.length > 255 || !/^[a-zA-Z0-9._:-]+$/.test(hostname)) {
      badRequest('hostname is required and must be a valid host/IP')
    }
    host = String(body?.ip ?? '').trim() || hostname
    if (body?.snmp_disabled === true) {
      const icmpOnly = await testIcmp(host, defaults.timeoutMs)
      return { host, icmp: icmpOnly, snmp: { ok: false, outcome: 'skipped', error: 'SNMP disabled (ICMP-only device)', durationMs: 0, target: host } }
    }
    const version = (body?.snmp_version ?? 'v2c') as SnmpVersion
    if (!SNMP_VERSIONS.includes(version)) badRequest(`snmp_version must be one of ${SNMP_VERSIONS.join(', ')}`)

    let profile: Partial<InlineSnmpInput> | null = null
    if (body?.credential_profile_id) {
      profile = await loadDecryptedProfile(db, Number(body.credential_profile_id))
      if (!profile) notFound('credential profile')
    }

    const cfg = buildInlineSnmpConfig(
      {
        host,
        port: body?.snmp_port ? Number(body.snmp_port) : null,
        version,
        community: body?.snmp_community ? String(body.snmp_community) : null,
        context: body?.snmp_context ? String(body.snmp_context) : null,
        v3_level: body?.v3_level ?? null,
        v3_username: body?.v3_username ?? null,
        v3_auth_protocol: body?.v3_auth_protocol ?? null,
        v3_auth_password: body?.v3_auth_password ?? null,
        v3_priv_protocol: body?.v3_priv_protocol ?? null,
        v3_priv_password: body?.v3_priv_password ?? null
      },
      profile,
      defaults
    )
    if (cfg.version === 'v3' && !cfg.v3?.username) badRequest('SNMPv3 requires a username')
    snmpPromise = testSnmp(cfg)
  }

  const [icmp, snmp] = await Promise.all([testIcmp(host, defaults.timeoutMs), snmpPromise])
  return {
    host,
    icmp,
    snmp: snmp ?? { ok: false, outcome: 'skipped', error: 'SNMP disabled on this device', durationMs: 0, target: host }
  }
})
