import type { H3Event } from 'h3'
import { requireApp, type SessionUser } from '~~/server/utils/auth'
import type { AppTier } from '~~/shared/utils/entitlements'

/**
 * Per-app guard for the Monitoring sub-app. The appAccess middleware already
 * rejects unauthenticated callers and anyone without a monitoring entitlement
 * (read access = viewer); endpoints call this to demand a higher tier:
 *
 *  - viewer:   read everything (devices, graphs, alerts, logs, maps, reports)
 *  - operator: acknowledge alerts + notes, run poll/discovery now,
 *              maintenance windows, replay dead-letter jobs / traps
 *  - manager:  full Monitoring administration (devices, credentials, rules,
 *              transports, templates, services, bills, groups, settings) —
 *              the "Monitoring administrator" tier
 */
export function requireMonitoring(event: H3Event, min: AppTier = 'viewer'): Promise<SessionUser> {
  return requireApp(event, 'monitoring', min)
}
