import { requireMonitoring } from '../../../../utils/monitoringAuth'
import { monDb, auditMonitoring, badRequest } from '../../../../utils/monApi'
import { normalizeDeviceInput } from '../../../../utils/deviceInput'
import { testIcmp, testSnmp, buildInlineSnmpConfig, loadDecryptedProfile, loadAllDecryptedProfiles } from '../../../../snmp/preflight'
import { enqueue } from '../../../../jobs/queue'

/**
 * POST /api/monitoring/v1/devices — add a device (admin tier).
 * Body: hostname (required) + optional SNMP/credential/location fields.
 *
 * Reachability preflight before insert: SNMP devices must answer a GET of
 * the system scalars with the supplied credentials; ICMP-only devices must
 * answer a ping. `force=true` skips the preflight (LibreNMS force-add).
 * Discovery is queued immediately so the device populates without waiting
 * for the next cycle.
 */
export default defineEventHandler(async (event) => {
  const user = await requireMonitoring(event, 'admin')
  const db = await monDb()
  const body = await readBody(event)
  const values = normalizeDeviceInput(body, true)

  const dupe = await db.query(`SELECT id FROM monitoring.devices WHERE lower(hostname) = lower($1)`, [values.hostname])
  if (dupe.rows.length) badRequest(`a device with hostname "${values.hostname}" already exists`)

  const force = body?.force === true
  let preflight: Record<string, unknown> | null = null
  if (!force) {
    const rc = useRuntimeConfig().monitoring as Record<string, any>
    const defaults = { timeoutMs: Number(rc.snmpTimeoutMs ?? 3000), retries: Number(rc.snmpRetries ?? 2) }
    const host = (values.ip as string | null) || (values.hostname as string)

    if (values.snmp_disabled === true) {
      const icmp = await testIcmp(host, defaults.timeoutMs)
      if (!icmp.alive) {
        badRequest(`preflight failed: ${host} did not answer ICMP (${icmp.error ?? 'no reply'}) — pass force=true to add anyway`)
      }
      preflight = { icmp }
    } else {
      const inline = {
        host,
        port: body?.snmp_port ? Number(body.snmp_port) : null,
        version: body?.snmp_version ?? null,
        community: body?.snmp_community ? String(body.snmp_community) : null,
        context: body?.snmp_context ? String(body.snmp_context) : null,
        v3_level: body?.v3_level ?? null,
        v3_username: body?.v3_username ?? null,
        v3_auth_protocol: body?.v3_auth_protocol ?? null,
        v3_auth_password: body?.v3_auth_password ?? null,
        v3_priv_protocol: body?.v3_priv_protocol ?? null,
        v3_priv_password: body?.v3_priv_password ?? null
      }
      // A bare version selection is not a credential — only an actual secret
      // or username counts, otherwise the profile candidate loop runs.
      const hasInlineCreds = !!(inline.community || inline.v3_username)

      if (values.credential_profile_id || hasInlineCreds) {
        // Explicit credentials: they must work.
        const profile = values.credential_profile_id ? await loadDecryptedProfile(db, Number(values.credential_profile_id)) : null
        const cfg = buildInlineSnmpConfig(inline, profile, defaults)
        if (cfg.version === 'v3' && !cfg.v3?.username) badRequest('SNMPv3 requires a username (or pass force=true to add without preflight)')
        const snmp = await testSnmp(cfg)
        if (!snmp.ok) {
          badRequest(`SNMP preflight failed (${snmp.outcome}): ${snmp.error} — pass force=true to add anyway`)
        }
        preflight = { snmp: { sys_name: snmp.system.sysName, detected_os: snmp.detected.os, detected_type: snmp.detected.device_type, duration_ms: snmp.durationMs } }
        if (snmp.detected.device_type) values.device_type = snmp.detected.device_type
      } else {
        // No credentials given: try every saved profile in attempt order,
        // then the public/v2c default — mirroring discovery's candidate
        // loop — and pin the profile that answered.
        const candidates: Array<{ profileId: number | null; name: string | null; input: Partial<typeof inline> }> =
          (await loadAllDecryptedProfiles(db)).map((p) => ({ profileId: p.id, name: p.name, input: p.input }))
        candidates.push({ profileId: null, name: null, input: {} })
        const failures: string[] = []
        let matched = false
        for (const cand of candidates) {
          const cfg = buildInlineSnmpConfig(inline, cand.input, defaults)
          if (cfg.version === 'v3' && !cfg.v3?.username) continue
          const snmp = await testSnmp(cfg)
          if (snmp.ok) {
            if (cand.profileId != null) values.credential_profile_id = cand.profileId
            preflight = {
              snmp: {
                sys_name: snmp.system.sysName, detected_os: snmp.detected.os, detected_type: snmp.detected.device_type, duration_ms: snmp.durationMs,
                matched_profile: cand.name ?? 'default (public/v2c)'
              }
            }
            if (snmp.detected.device_type) values.device_type = snmp.detected.device_type
            matched = true
            break
          }
          failures.push(`${cand.name ?? 'default'}: ${snmp.outcome}`)
        }
        if (!matched) {
          badRequest(`SNMP preflight failed for every credential candidate (${failures.join('; ')}) — pass force=true to add anyway`)
        }
      }
    }
  }

  const cols = Object.keys(values)
  const placeholders = cols.map((_, i) => `$${i + 1}`)
  const res = await db.query(
    `INSERT INTO monitoring.devices (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING id, hostname`,
    Object.values(values)
  )
  const device = res.rows[0]

  await enqueue(db, { type: 'discovery', deviceId: Number(device.id), pollerGroup: Number(values.poller_group ?? 0), dedupeKey: `discovery:${device.id}`, priority: 10 })
  await auditMonitoring(user.username, 'device.create', String(device.id), `hostname=${device.hostname}${force ? ' (forced)' : ''}`)

  setResponseStatus(event, 201)
  return { id: Number(device.id), hostname: device.hostname, queued_discovery: true, preflight: force ? 'skipped' : preflight }
})
