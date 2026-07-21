import type { H3Event } from 'h3'
import { requireUser, resolveUserEntitlements, type SessionUser } from './auth'
import { tierAtLeast, type AppKey } from '../../shared/utils/entitlements'
import { NOTIFICATION_SCOPE_GLOBAL } from '../../shared/utils/notifications'

/**
 * Authorize managing (or reading) a notification record at a given scope so
 * each app can own its own channels/templates without portal-admin rights:
 *   - portal admins manage everything;
 *   - a Global record requires portal admin;
 *   - an app-scoped record requires manager+ tier in that app.
 */
export async function requireNotificationScope(event: H3Event, scope: string): Promise<SessionUser> {
  const user = await requireUser(event)
  if (user.role === 'admin') return user
  if (!scope || scope === NOTIFICATION_SCOPE_GLOBAL) {
    throw createError({ statusCode: 403, statusMessage: 'Only a portal admin can manage Global notifications' })
  }
  const apps = await resolveUserEntitlements(user)
  if (tierAtLeast(apps[scope as AppKey] ?? null, 'manager')) return user
  throw createError({ statusCode: 403, statusMessage: `Requires manager access to the ${scope} app` })
}
