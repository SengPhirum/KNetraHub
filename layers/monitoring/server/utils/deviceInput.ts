import { encryptSecret } from '~~/server/utils/secretCrypto'
import { SNMP_VERSIONS, SNMPV3_LEVELS, SNMP_AUTH_PROTOCOLS, SNMP_PRIV_PROTOCOLS, DEVICE_TYPES } from '../../shared/constants'
import { badRequest } from './monApi'

/**
 * Validate + normalize a device create/update body into column values.
 * Secrets are encrypted here; a blank secret on update means "keep current"
 * (handled by the caller omitting the column).
 */
export interface DeviceInput {
  hostname: string
  display_name?: string | null
  ip?: string | null
  snmp_disabled?: boolean
  credential_profile_id?: number | null
  snmp_version?: string | null
  snmp_community?: string
  snmp_port?: number | null
  snmp_context?: string | null
  v3_level?: string | null
  v3_username?: string | null
  v3_auth_protocol?: string | null
  v3_auth_password?: string
  v3_priv_protocol?: string | null
  v3_priv_password?: string
  os_override?: string | null
  hardware_override?: string | null
  location_id?: number | null
  poller_group?: number
  port_association_mode?: string | null
  poll_interval_seconds?: number | null
  discovery_interval_seconds?: number | null
  notes?: string | null
}

const HOSTNAME_PATTERN = /^[a-zA-Z0-9._:-]{1,255}$/

export function normalizeDeviceInput(body: any, isCreate: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {}

  if (isCreate || body.hostname !== undefined) {
    const hostname = String(body.hostname ?? '').trim()
    if (!hostname || !HOSTNAME_PATTERN.test(hostname)) badRequest('hostname is required and must be a valid host/IP')
    out.hostname = hostname
  }
  if (body.display_name !== undefined) out.display_name = body.display_name ? String(body.display_name).slice(0, 255) : null
  if (body.ip !== undefined) out.ip = body.ip ? String(body.ip) : null
  if (body.snmp_disabled !== undefined) out.snmp_disabled = !!body.snmp_disabled
  if (body.credential_profile_id !== undefined) out.credential_profile_id = body.credential_profile_id ? Number(body.credential_profile_id) : null

  if (body.snmp_version !== undefined) {
    if (body.snmp_version && !SNMP_VERSIONS.includes(body.snmp_version)) badRequest(`snmp_version must be one of ${SNMP_VERSIONS.join(', ')}`)
    out.snmp_version = body.snmp_version || null
  }
  if (body.snmp_port !== undefined) out.snmp_port = body.snmp_port ? Number(body.snmp_port) : null
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

  // Secrets: only set the column when a non-empty value is provided, so a blank
  // on update keeps the existing ciphertext.
  if (body.snmp_community) out.snmp_community = encryptSecret(String(body.snmp_community))
  if (body.v3_auth_password) out.v3_auth_password = encryptSecret(String(body.v3_auth_password))
  if (body.v3_priv_password) out.v3_priv_password = encryptSecret(String(body.v3_priv_password))

  // Manual type choice is stored as an override so auto-detection at
  // discovery/scan time never clobbers it; blank/null returns to auto.
  if (body.device_type !== undefined) {
    if (body.device_type && !DEVICE_TYPES.includes(body.device_type)) {
      badRequest(`device_type must be one of ${DEVICE_TYPES.join(', ')} (or empty for auto)`)
    }
    out.device_type_override = body.device_type || null
  }
  if (body.os_override !== undefined) out.os_override = body.os_override ? String(body.os_override) : null
  if (body.hardware_override !== undefined) out.hardware_override = body.hardware_override ? String(body.hardware_override) : null
  if (body.location_id !== undefined) out.location_id = body.location_id ? Number(body.location_id) : null
  if (body.poller_group !== undefined) out.poller_group = Number(body.poller_group) || 0
  if (body.port_association_mode !== undefined) {
    const mode = String(body.port_association_mode ?? 'ifIndex')
    if (!['ifIndex', 'ifName', 'ifDescr', 'ifAlias'].includes(mode)) badRequest('invalid port_association_mode')
    out.port_association_mode = mode
  }
  if (body.poll_interval_seconds !== undefined) out.poll_interval_seconds = body.poll_interval_seconds ? Number(body.poll_interval_seconds) : null
  if (body.discovery_interval_seconds !== undefined) out.discovery_interval_seconds = body.discovery_interval_seconds ? Number(body.discovery_interval_seconds) : null
  if (body.notes !== undefined) out.notes = body.notes ? String(body.notes).slice(0, 4000) : null
  if (body.disabled !== undefined) out.disabled = !!body.disabled
  if (body.ignored !== undefined) out.ignored = !!body.ignored

  return out
}
