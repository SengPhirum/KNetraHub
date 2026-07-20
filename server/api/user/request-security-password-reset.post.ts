import { requireUser } from '~~/server/utils/auth'
import { createSecurityPasswordReset, getUserById, audit } from '~~/server/utils/store'
import { sendTemplateMail, resolvePortalUrl } from '~~/server/utils/mailer'

/**
 * Self-service "I forgot my security password": a signed-in user emails
 * themselves a one-time link to set a new one - the same tokenized flow an
 * admin triggers for another user. The existing secret is left in place until
 * the link is actually used, so cancelling changes nothing.
 */
export default defineEventHandler(async (event) => {
  const session = await requireUser(event)
  const me = await getUserById(session.id)
  if (!me) throw createError({ statusCode: 404, statusMessage: 'User not found' })
  if (!me.email) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Your account has no email address on file, so a reset link cannot be sent. Ask a portal admin to reset it for you.'
    })
  }

  const { token, ttlHours } = await createSecurityPasswordReset(me.id)
  const base = resolvePortalUrl(event)
  const resetUrl = `${base}/security-password/reset?token=${token}`
  const result = await sendTemplateMail(
    'security-password-reset',
    me.email,
    {
      user: { displayName: me.displayName, username: me.username, email: me.email },
      resetUrl,
      expiryHours: String(ttlHours),
      actor: me.username
    },
    { event }
  )
  if (!result.ok) {
    throw createError({ statusCode: 502, statusMessage: result.error || 'Could not send the reset email. Check Admin > Configuration > Email.' })
  }
  await audit({ actor: me.username, action: 'user.security_password.reset_request' })
  return { emailed: true, target: result.target }
})
