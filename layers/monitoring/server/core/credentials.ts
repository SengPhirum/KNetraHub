import type { Pool } from 'pg'
import { decryptSecret } from '~~/server/utils/secretCrypto'
import type { ResolvedSnmpConfig } from '../snmp/engine'
import type { DeviceRow } from './registry'

/**
 * Resolve the effective SNMP configuration for a device: per-device override
 * columns win, then the linked credential profile, then engine defaults from
 * runtimeConfig. All secrets are decrypted here, on the server, at use time —
 * they never leave this module except inside the SnmpClient.
 */
export async function resolveSnmpConfig(db: Pool, device: DeviceRow): Promise<ResolvedSnmpConfig | null> {
  if (device.snmp_disabled) return null
  const rc = useRuntimeConfig().monitoring as Record<string, any>

  let profile: Record<string, any> | null = null
  if (device.credential_profile_id != null) {
    const res = await db.query('SELECT * FROM monitoring.credential_profiles WHERE id = $1', [device.credential_profile_id])
    profile = res.rows[0] ?? null
  }

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
