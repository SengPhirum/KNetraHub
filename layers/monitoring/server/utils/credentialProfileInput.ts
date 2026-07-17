import { encryptSecret } from '~~/server/utils/secretCrypto'
import { SNMP_VERSIONS, SNMPV3_LEVELS, SNMP_AUTH_PROTOCOLS, SNMP_PRIV_PROTOCOLS } from '../../shared/constants'
import { badRequest } from './monApi'

/**
 * Validate + normalize a credential-profile create/update body into column
 * values. Secrets are encrypted here; a blank secret on update means "keep
 * current" (handled by the caller omitting the column) — same convention as
 * deviceInput.ts.
 */
export interface CredentialProfileInput {
  name: string
  snmp_version?: string
  snmp_port?: number
  snmp_transport?: string
  snmp_context?: string | null
  v3_level?: string | null
  v3_username?: string | null
  v3_auth_protocol?: string | null
  v3_priv_protocol?: string | null
  attempt_order?: number
}

export function normalizeCredentialProfileInput(body: any, isCreate: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {}

  if (isCreate || body.name !== undefined) {
    const name = String(body.name ?? '').trim()
    if (!name) badRequest('name is required')
    out.name = name
  }

  if (body.snmp_version !== undefined) {
    const version = String(body.snmp_version ?? 'v2c')
    if (!SNMP_VERSIONS.includes(version as any)) badRequest(`snmp_version must be one of ${SNMP_VERSIONS.join(', ')}`)
    out.snmp_version = version
  }
  if (body.snmp_port !== undefined) out.snmp_port = body.snmp_port ? Number(body.snmp_port) : 161
  if (body.snmp_transport !== undefined) {
    const transport = String(body.snmp_transport ?? 'udp4')
    if (!['udp4', 'udp6'].includes(transport)) badRequest('snmp_transport must be udp4 or udp6')
    out.snmp_transport = transport
  }
  if (body.snmp_context !== undefined) out.snmp_context = body.snmp_context ? String(body.snmp_context) : null

  if (body.v3_level !== undefined) {
    if (body.v3_level && !SNMPV3_LEVELS.includes(body.v3_level)) badRequest(`v3_level must be one of ${SNMPV3_LEVELS.join(', ')}`)
    out.v3_level = body.v3_level || null
  }
  if (body.v3_username !== undefined) out.v3_username = body.v3_username ? String(body.v3_username) : null
  if (body.v3_auth_protocol !== undefined) {
    if (body.v3_auth_protocol && !SNMP_AUTH_PROTOCOLS.includes(body.v3_auth_protocol)) badRequest('invalid v3_auth_protocol')
    out.v3_auth_protocol = body.v3_auth_protocol || null
  }
  if (body.v3_priv_protocol !== undefined) {
    if (body.v3_priv_protocol && !SNMP_PRIV_PROTOCOLS.includes(body.v3_priv_protocol)) badRequest('invalid v3_priv_protocol')
    out.v3_priv_protocol = body.v3_priv_protocol || null
  }

  // Secrets: only set the column when a non-empty value is provided, so a
  // blank on update keeps the existing ciphertext.
  if (body.snmp_community) out.snmp_community = encryptSecret(String(body.snmp_community))
  if (body.v3_auth_password) out.v3_auth_password = encryptSecret(String(body.v3_auth_password))
  if (body.v3_priv_password) out.v3_priv_password = encryptSecret(String(body.v3_priv_password))

  if (body.attempt_order !== undefined) out.attempt_order = Number(body.attempt_order) || 100

  return out
}
