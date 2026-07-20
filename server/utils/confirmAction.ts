import type { H3Event } from 'h3'
import { requireUser, type SessionUser } from './auth'
import { verifySecurityPassword, hasSecurityPassword } from './store'
import { logSystem } from './moduleLogs'

/**
 * Step-up authentication for critical, hard-to-reverse actions (delete stack /
 * service / node / volume, delete an IPAM subnet/section/device, ...): the
 * browser session must re-prove the user's *security password* - a portal-wide
 * second secret, distinct from the login password - carried in the
 * `x-confirm-password` header, before the handler runs. This is enforced
 * server-side: a stolen session cookie alone is not enough to destroy
 * resources, and a UI-only popup could be bypassed with a direct API call.
 *
 * The security password (not the login password) is used deliberately so this
 * works uniformly for every account type - including SSO (OIDC) sessions,
 * which have no password KNetraHub could otherwise verify. Every user
 * configures it once (prompted at login) and it is reused across all sub-apps;
 * a portal admin can reset it. See server/utils/store.ts.
 *
 * API-token (Bearer) callers are exempt: a token is a deliberately issued
 * credential for automation, where an interactive password prompt cannot
 * exist. Revoke the token to cut that path off.
 */
export async function requirePasswordConfirm(event: H3Event): Promise<SessionUser> {
  const user = await requireUser(event)

  const authHeader = getRequestHeader(event, 'authorization')
  if (authHeader?.startsWith('Bearer ')) return user

  // Not configured yet: signal the client to prompt the user to set one up
  // (428 Precondition Required) rather than silently rejecting. The set-up
  // prompt normally runs at login, so this is a backstop.
  if (!(await hasSecurityPassword(user.id))) {
    throw createError({
      statusCode: 428,
      statusMessage: 'Set up your security password before deleting critical records',
      data: { securityPasswordRequired: true }
    })
  }

  const password = getRequestHeader(event, 'x-confirm-password') || ''
  if (!password) {
    throw createError({ statusCode: 428, statusMessage: 'This action requires your security password' })
  }

  const ok = await verifySecurityPassword(user.id, password).catch(() => false)
  if (!ok) {
    await logSystem('portal', 'warning', 'auth.confirm.failed', `${user.username} failed security-password confirmation for ${event.method} ${event.path}`).catch(() => {})
    throw createError({ statusCode: 403, statusMessage: 'Security password confirmation failed' })
  }
  return user
}
