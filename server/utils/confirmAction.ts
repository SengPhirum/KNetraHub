import type { H3Event } from 'h3'
import { requireUser, type SessionUser } from './auth'
import { verifyLocalUser } from './store'
import { ldapAuthenticate } from './ldap'
import { logSystem } from './moduleLogs'

/**
 * Step-up authentication for critical, hard-to-reverse actions (delete stack /
 * service / node / volume, ...): the browser session must re-prove the user's
 * password, carried in the `x-confirm-password` header, before the handler
 * runs. This is enforced server-side - a stolen session cookie alone is not
 * enough to destroy resources, and a UI-only popup could be bypassed with a
 * direct API call.
 *
 * API-token (Bearer) callers are exempt: a token is a deliberately issued
 * credential for automation, where an interactive password prompt cannot
 * exist. Revoke the token to cut that path off.
 */
export async function requirePasswordConfirm(event: H3Event): Promise<SessionUser> {
  const user = await requireUser(event)

  const authHeader = getRequestHeader(event, 'authorization')
  if (authHeader?.startsWith('Bearer ')) return user

  const password = getRequestHeader(event, 'x-confirm-password') || ''
  if (!password) {
    throw createError({ statusCode: 428, statusMessage: 'This action requires password confirmation' })
  }

  let ok = false
  if (user.source === 'local') {
    ok = !!(await verifyLocalUser(user.username, password).catch(() => null))
  } else if (user.source === 'ldap') {
    ok = await ldapAuthenticate(user.username, password).then(() => true).catch(() => false)
  } else {
    // SSO (OIDC) sessions have no password KNetraHub could verify.
    throw createError({
      statusCode: 400,
      statusMessage: 'Password confirmation is not available for SSO sessions - use a local or LDAP account for this action'
    })
  }

  if (!ok) {
    await logSystem('portal', 'warning', 'auth.confirm.failed', `${user.username} failed password confirmation for ${event.method} ${event.path}`).catch(() => {})
    throw createError({ statusCode: 403, statusMessage: 'Password confirmation failed' })
  }
  return user
}
