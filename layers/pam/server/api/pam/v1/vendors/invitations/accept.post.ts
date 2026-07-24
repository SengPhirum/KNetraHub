import { acceptInvitation } from '~~/layers/pam/server/utils/pamVendor'

/** Accept a vendor invitation using the emailed one-time token (no portal
 * session — the token is the credential). Creates a temporary vendor identity. */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const token = String(body?.token || '').trim()
  if (!token) throw createError({ statusCode: 400, statusMessage: 'token is required' })
  const res = await acceptInvitation(token, {
    displayName: body?.display_name, mfaVerified: body?.mfa_verified === true, termsAccepted: body?.terms_accepted === true
  })
  setResponseHeaders(event, { 'cache-control': 'no-store' })
  return { ok: true, vendorUserId: res.vendorUserId }
})
