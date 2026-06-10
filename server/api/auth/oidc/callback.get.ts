import { oidcCompleteLogin } from '~~/server/utils/oidc'
import { upsertExternalUser, touchLogin, audit } from '~~/server/utils/store'
import { setSession } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  let result
  try {
    result = await oidcCompleteLogin(event)
  } catch (err: any) {
    const reason = err?.statusMessage || 'OIDC login failed'
    await audit({ actor: 'unknown', action: 'auth.login.failed', detail: `via oidc: ${reason}` }).catch(() => {})
    // Land back on the login page with a readable error instead of a JSON 401
    return sendRedirect(event, `/login?error=${encodeURIComponent(reason)}`, 302)
  }

  const stored = await upsertExternalUser({ ...result, source: 'oidc' })
  const session = {
    id: stored.id,
    username: stored.username,
    displayName: stored.displayName,
    role: stored.role,
    source: 'oidc' as const
  }

  await touchLogin(session.username)
  await setSession(event, session)
  await audit({ actor: session.username, action: 'auth.login', detail: 'via oidc' })

  return sendRedirect(event, '/', 302)
})
