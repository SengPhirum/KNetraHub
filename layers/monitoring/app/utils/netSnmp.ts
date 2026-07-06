// Shared SNMP option lists + v3 credential defaults for the Network module's
// device forms (Add Device modal + device Settings tab). Option `value`s are the
// exact net-snmp protocol keys the poller maps directly (see
// server/utils/netMonitor.ts), so don't rename them without updating the server.

export interface SelectItem { value: string; label: string }

export const SNMP_VERSIONS: SelectItem[] = [
  { value: 'v1', label: 'v1' },
  { value: 'v2c', label: 'v2c' },
  { value: 'v3', label: 'v3' }
]

export const SNMPV3_SEC_LEVELS: SelectItem[] = [
  { value: 'noAuthNoPriv', label: 'noAuthNoPriv' },
  { value: 'authNoPriv', label: 'authNoPriv' },
  { value: 'authPriv', label: 'authPriv' }
]

export const SNMPV3_AUTH_PROTOCOLS: SelectItem[] = [
  { value: 'md5', label: 'MD5' },
  { value: 'sha', label: 'SHA' },
  { value: 'sha256', label: 'SHA-256' },
  { value: 'sha512', label: 'SHA-512' }
]

export const SNMPV3_PRIV_PROTOCOLS: SelectItem[] = [
  { value: 'des', label: 'DES' },
  { value: 'aes', label: 'AES' },
  { value: 'aes256b', label: 'AES-256' }
]

export interface SnmpV3Fields {
  snmp_sec_level: string
  snmp_auth_user: string
  snmp_auth_protocol: string
  snmp_auth_password: string
  snmp_priv_protocol: string
  snmp_priv_password: string
}

/** The SNMP-related fields shared by the Add Device and Settings forms; bound by
 *  the <NetSnmpFields> component. */
export type SnmpFormFields = { snmp_version: string; snmp_community: string } & SnmpV3Fields

/** Defaults for a new v3 device: full authPriv with modern SHA + AES. */
export function defaultSnmpV3(): SnmpV3Fields {
  return {
    snmp_sec_level: 'authPriv',
    snmp_auth_user: '',
    snmp_auth_protocol: 'sha',
    snmp_auth_password: '',
    snmp_priv_protocol: 'aes',
    snmp_priv_password: ''
  }
}
