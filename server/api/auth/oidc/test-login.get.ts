import { requireRole } from '~~/server/utils/auth'
import { oidcBeginLoginTest } from '~~/server/utils/oidc'
import { OIDC_TEST_MESSAGE, sendOidcTestPopup } from '~~/server/utils/oidcTestPopup'
import { audit } from '~~/server/utils/store'

export default defineEventHandler(async (event) => {
  let actor = 'unknown'
  try {
    const user = await requireRole(event, 'admin')
    actor = user.username
    const url = await oidcBeginLoginTest(event)
    await audit({ actor, action: 'settings.auth.oidc_login_test.start' })
    return sendRedirect(event, url, 302)
  } catch (err: any) {
    const error = err?.statusMessage || err?.message || 'Could not start OIDC login test'
    await audit({ actor, action: 'settings.auth.oidc_login_test.failed', detail: `start: ${error}` }).catch(() => {})
    setResponseStatus(event, err?.statusCode || 400)
    return sendOidcTestPopup(event, { type: OIDC_TEST_MESSAGE, ok: false, error })
  }
})
