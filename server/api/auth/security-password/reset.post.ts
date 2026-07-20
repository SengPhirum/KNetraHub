import { consumeSecurityPasswordReset, audit } from '~~/server/utils/store'

// Keep in step with the self-service set endpoint (user/security-password.post).
const MIN_LENGTH = 6

/**
 * Public: set a new portal security password using a one-time reset token. No
 * session is required - possession of the emailed token is the authorization.
 * The token is single-use and time-boxed (see store.consumeSecurityPasswordReset).
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ token?: string; password?: string; confirm?: string }>(event)
  const token = typeof body?.token === 'string' ? body.token : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  const confirm = typeof body?.confirm === 'string' ? body.confirm : ''

  if (password.length < MIN_LENGTH) {
    throw createError({ statusCode: 400, statusMessage: `Security password must be at least ${MIN_LENGTH} characters` })
  }
  if (password !== confirm) {
    throw createError({ statusCode: 400, statusMessage: 'Security password and confirmation do not match' })
  }

  const result = await consumeSecurityPasswordReset(token, password)
  if (!result) {
    throw createError({ statusCode: 400, statusMessage: 'This reset link is invalid or has already been used' })
  }
  await audit({ actor: result.username, action: 'user.security_password.reset_complete' })
  return { ok: true }
})
