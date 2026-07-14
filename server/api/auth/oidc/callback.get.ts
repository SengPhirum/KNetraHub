import { requireRole, setSession } from '~~/server/utils/auth'
import { isOidcLoginTestCallback, oidcCompleteLogin, oidcCompleteLoginTest } from '~~/server/utils/oidc'
import { OIDC_TEST_MESSAGE, sendOidcTestPopup } from '~~/server/utils/oidcTestPopup'
import { upsertExternalUser, touchLogin, audit } from '~~/server/utils/store'

export default defineEventHandler(async (event) => {
  if (isOidcLoginTestCallback(event)) {
    let actor = 'unknown'
    try {
      const admin = await requireRole(event, 'admin')
      actor = admin.username
      const report = await oidcCompleteLoginTest(event)
      const userinfoStatus = report.userinfo.ok === true ? 'passed' : report.userinfo.attempted ? 'failed' : 'not-run'
      await audit({
        actor,
        action: 'settings.auth.oidc_login_test.succeeded',
        target: report.issuer,
        detail: `mappedUser=${report.mappedUser.username}; role=${report.mappedUser.role}; userinfo=${userinfoStatus}; tookMs=${report.tookMs}`
      })
      return sendOidcTestPopup(event, { type: OIDC_TEST_MESSAGE, ok: true, report })
    } catch (err: any) {
      const error = err?.statusMessage || err?.message || 'OIDC login test failed'
      await audit({ actor, action: 'settings.auth.oidc_login_test.failed', detail: `callback: ${error}` }).catch(() => {})
      setResponseStatus(event, err?.statusCode || 401)
      return sendOidcTestPopup(event, { type: OIDC_TEST_MESSAGE, ok: false, error })
    }
  }

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
    source: 'oidc' as const,
    realmRoles: result.realmRoles
  }

  await touchLogin(session.username)
  await setSession(event, session)
  await audit({ actor: session.username, action: 'auth.login', detail: 'via oidc' })

  return sendRedirect(event, '/', 302)
})
