// Shared SNMP option lists + v3 credential defaults for the IPAM Device form.
// A local port of layers/monitoring/app/utils/netSnmp.ts - kept separate
// rather than imported cross-layer (ipmgt and monitoring are isolated
// siblings). Option `value`s match the same net-snmp protocol keys.

export interface SelectItem { value: string; label: string }

export const IPAM_SNMP_VERSIONS: SelectItem[] = [
  { value: 'v1', label: 'v1' },
  { value: 'v2c', label: 'v2c' },
  { value: 'v3', label: 'v3' }
]

export const IPAM_SNMPV3_SEC_LEVELS: SelectItem[] = [
  { value: 'noAuthNoPriv', label: 'noAuthNoPriv' },
  { value: 'authNoPriv', label: 'authNoPriv' },
  { value: 'authPriv', label: 'authPriv' }
]

export const IPAM_SNMPV3_AUTH_PROTOCOLS: SelectItem[] = [
  { value: 'md5', label: 'MD5' },
  { value: 'sha', label: 'SHA' },
  { value: 'sha256', label: 'SHA-256' },
  { value: 'sha512', label: 'SHA-512' }
]

export const IPAM_SNMPV3_PRIV_PROTOCOLS: SelectItem[] = [
  { value: 'des', label: 'DES' },
  { value: 'aes', label: 'AES' },
  { value: 'aes256b', label: 'AES-256' }
]

export interface IpamSnmpV3Fields {
  snmp_sec_level: string
  snmp_auth_user: string
  snmp_auth_protocol: string
  snmp_auth_password: string
  snmp_priv_protocol: string
  snmp_priv_password: string
}

export type IpamSnmpFormFields = { snmp_version: string; snmp_community: string } & IpamSnmpV3Fields

/** Defaults for a new v3 device: full authPriv with modern SHA + AES. */
export function defaultIpamSnmpV3(): IpamSnmpV3Fields {
  return {
    snmp_sec_level: 'authPriv',
    snmp_auth_user: '',
    snmp_auth_protocol: 'sha',
    snmp_auth_password: '',
    snmp_priv_protocol: 'aes',
    snmp_priv_password: ''
  }
}
