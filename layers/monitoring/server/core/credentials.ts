import type { Pool } from 'pg'
import { decryptSecret } from '~~/server/utils/secretCrypto'
import type { ResolvedSnmpConfig } from '../snmp/engine'
import type { DeviceRow } from './registry'

function buildConfig(device: DeviceRow, profile: Record<string, any> | null, rc: Record<string, any>): ResolvedSnmpConfig | null {
  const pick = <T>(deviceVal: T | null | undefined, profileVal: T | null | undefined, fallback: T): T =>
    deviceVal ?? profileVal ?? fallback

  const version = pick(device.snmp_version as any, profile?.snmp_version, 'v2c') as ResolvedSnmpConfig['version']
  const host = (device.ip as string | null) || device.hostname

  const cfg: ResolvedSnmpConfig = {
    host,
    port: Number(pick(device.snmp_port as any, profile?.snmp_port, 161)),
    transport: pick(device.snmp_transport as any, profile?.snmp_transport, host.includes(':') ? 'udp6' : 'udp4') as 'udp4' | 'udp6',
    version,
    context: pick(device.snmp_context as any, profile?.snmp_context, '') || undefined,
    timeoutMs: Number(rc.snmpTimeoutMs ?? 3000),
    retries: Number(rc.snmpRetries ?? 2)
  }

  if (version === 'v3') {
    cfg.v3 = {
      level: pick(device.v3_level as any, profile?.v3_level, 'authPriv'),
      username: pick(device.v3_username as any, profile?.v3_username, ''),
      authProtocol: pick(device.v3_auth_protocol as any, profile?.v3_auth_protocol, 'sha'),
      authPassword: decryptSecret(pick(device.v3_auth_password as any, profile?.v3_auth_password, '')),
      privProtocol: pick(device.v3_priv_protocol as any, profile?.v3_priv_protocol, 'aes'),
      privPassword: decryptSecret(pick(device.v3_priv_password as any, profile?.v3_priv_password, ''))
    }
    if (!cfg.v3.username) return null
  } else {
    cfg.community = decryptSecret(pick(device.snmp_community as any, profile?.snmp_community, '')) || 'public'
  }
  return cfg
}

/**
 * Resolve the effective SNMP configuration for a device: per-device override
 * columns win, then the linked credential profile, then engine defaults from
 * runtimeConfig. Single result — used by polling, which should stay fast and
 * not re-probe alternatives every cycle. All secrets are decrypted here, on
 * the server, at use time — they never leave this module except inside the
 * SnmpClient.
 */
export async function resolveSnmpConfig(db: Pool, device: DeviceRow): Promise<ResolvedSnmpConfig | null> {
  if (device.snmp_disabled) return null
  const rc = useRuntimeConfig().monitoring as Record<string, any>

  let profile: Record<string, any> | null = null
  if (device.credential_profile_id != null) {
    const res = await db.query('SELECT * FROM monitoring.credential_profiles WHERE id = $1', [device.credential_profile_id])
    profile = res.rows[0] ?? null
  }
  return buildConfig(device, profile, rc)
}

export interface SnmpCandidate {
  cfg: ResolvedSnmpConfig
  /** The credential_profiles row this came from, if any — discovery pins this on the device once it's confirmed to work. */
  profileId: number | null
}

/**
 * Resolve every SNMP configuration worth trying for a device, in order —
 * used only by discovery (never polling, which needs one fast answer, not a
 * trial-and-error loop). A device with its own inline SNMP settings or an
 * already-assigned profile still resolves to exactly one candidate (nothing
 * to try — it's already known). Only a device with neither gets the full
 * list: every saved credential profile in attempt_order, then the classic
 * "public"/v2c default last, mirroring LibreNMS trying a configured
 * community list against a newly discovered host.
 */
export async function resolveSnmpCandidates(db: Pool, device: DeviceRow): Promise<SnmpCandidate[]> {
  if (device.snmp_disabled) return []
  const rc = useRuntimeConfig().monitoring as Record<string, any>

  const hasOwnConfig = device.credential_profile_id != null ||
    !!device.snmp_version || !!(device.snmp_community as any) || !!(device.v3_username as any)
  if (hasOwnConfig) {
    const cfg = await resolveSnmpConfig(db, device)
    return cfg ? [{ cfg, profileId: (device.credential_profile_id as any) ?? null }] : []
  }

  const profiles = (await db.query('SELECT * FROM monitoring.credential_profiles ORDER BY attempt_order ASC, id ASC')).rows
  const candidates: SnmpCandidate[] = []
  for (const profile of profiles) {
    const cfg = buildConfig(device, profile, rc)
    if (cfg) candidates.push({ cfg, profileId: Number(profile.id) })
  }
  const fallback = buildConfig(device, null, rc)
  if (fallback) candidates.push({ cfg: fallback, profileId: null })
  return candidates
}

/** Strip every credential column from a device/profile row for API output. */
const SECRET_COLUMNS = ['snmp_community', 'v3_auth_password', 'v3_priv_password'] as const

export function stripCredentials<T extends Record<string, any>>(row: T): Omit<T, (typeof SECRET_COLUMNS)[number]> & {
  snmp_community_set: boolean
  v3_auth_password_set: boolean
  v3_priv_password_set: boolean
} {
  const { snmp_community, v3_auth_password, v3_priv_password, ...rest } = row
  return {
    ...rest,
    snmp_community_set: !!snmp_community,
    v3_auth_password_set: !!v3_auth_password,
    v3_priv_password_set: !!v3_priv_password
  }
}
