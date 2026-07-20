import { peekSecurityPasswordReset } from '~~/server/utils/store'

/**
 * Public: check whether a security-password reset token is still valid so the
 * reset page can show the set-password form or an "expired link" message. The
 * token is not consumed here - only when the new password is submitted.
 */
export default defineEventHandler(async (event) => {
  const token = String(getQuery(event).token ?? '')
  const found = await peekSecurityPasswordReset(token)
  return { valid: !!found, username: found?.username ?? null }
})
