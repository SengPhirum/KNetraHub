import type { ResolvedSnmpConfig } from './engine'
import type { SnmpVersion } from '../../shared/constants'

/**
 * Building a ResolvedSnmpConfig from plaintext inline values (not-yet-saved
 * devices: add-device preflight, POST /snmp/test) with an optional
 * already-decrypted credential profile as fallback. Pure — the runtime
 * counterpart with DB/decryption lives in `preflight.ts`.
 */

export interface InlineSnmpInput {
  host: string
  port?: number | null
  version?: SnmpVersion | null
  community?: string | null
  context?: string | null
  v3_level?: string | null
  v3_username?: string | null
  v3_auth_protocol?: string | null
  v3_auth_password?: string | null
  v3_priv_protocol?: string | null
  v3_priv_password?: string | null
}

export function buildInlineSnmpConfig(
  input: InlineSnmpInput,
  profile: Partial<InlineSnmpInput> | null,
  defaults: { timeoutMs: number; retries: number }
): ResolvedSnmpConfig {
  const pick = <T>(a: T | null | undefined, b: T | null | undefined, fallback: T): T => a ?? b ?? fallback

  const version = pick(input.version, profile?.version as SnmpVersion | undefined, 'v2c')
  const cfg: ResolvedSnmpConfig = {
    host: input.host,
    port: Number(pick(input.port, profile?.port, 161)),
    transport: input.host.includes(':') ? 'udp6' : 'udp4',
    version,
    context: pick(input.context, profile?.context, '') || undefined,
    timeoutMs: defaults.timeoutMs,
    retries: defaults.retries
  }
  if (version === 'v3') {
    cfg.v3 = {
      level: pick(input.v3_level, profile?.v3_level, 'authPriv') as NonNullable<ResolvedSnmpConfig['v3']>['level'],
      username: pick(input.v3_username, profile?.v3_username, ''),
      authProtocol: pick(input.v3_auth_protocol, profile?.v3_auth_protocol, 'sha') as NonNullable<ResolvedSnmpConfig['v3']>['authProtocol'],
      authPassword: pick(input.v3_auth_password, profile?.v3_auth_password, ''),
      privProtocol: pick(input.v3_priv_protocol, profile?.v3_priv_protocol, 'aes') as NonNullable<ResolvedSnmpConfig['v3']>['privProtocol'],
      privPassword: pick(input.v3_priv_password, profile?.v3_priv_password, '')
    }
  } else {
    cfg.community = pick(input.community, profile?.community, '') || 'public'
  }
  return cfg
}
