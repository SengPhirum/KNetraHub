import type { H3Event } from 'h3'
import { requireApp, type SessionUser } from '~~/server/utils/auth'
import type { AppTier } from '~~/shared/utils/entitlements'

/**
 * Per-app guard for the Monitoring sub-app, mirroring ipmgt's requireIpam.
 * The appAccess middleware already rejects unauthenticated callers and anyone
 * without a monitoring entitlement (read access = viewer); mutation endpoints
 * call this to demand a higher tier:
 *  - operator: acknowledge/close problems, pause/resume monitoring,
 *    run discovery scans, generate reports
 *  - manager:  configuration CRUD (hosts, devices, items, triggers, templates,
 *    groups, actions, maintenance, web scenarios, maps, services, imports)
 */
export function requireMonitoring(event: H3Event, min: AppTier = 'viewer'): Promise<SessionUser> {
  return requireApp(event, 'monitoring', min)
}

/** SNMP credentials must never leave the server: list/detail responses carry
 *  `snmp_community_set` / `snmp_auth_password_set` booleans instead, and the
 *  update endpoints treat a blank credential as "keep the current value"
 *  (same convention as alert channels). */
export function stripSnmpSecrets<T extends Record<string, any>>(row: T): Omit<T, 'snmp_community' | 'snmp_auth_password' | 'snmp_priv_password'> & {
  snmp_community_set: boolean
  snmp_auth_password_set: boolean
  snmp_priv_password_set: boolean
} {
  const { snmp_community, snmp_auth_password, snmp_priv_password, ...rest } = row
  return {
    ...rest,
    snmp_community_set: !!snmp_community,
    snmp_auth_password_set: !!snmp_auth_password,
    snmp_priv_password_set: !!snmp_priv_password
  }
}
