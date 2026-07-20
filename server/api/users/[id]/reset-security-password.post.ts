import { requireRole } from '~~/server/utils/auth'
import { clearSecurityPassword, createSecurityPasswordReset, getUserById, audit } from '~~/server/utils/store'
import { sendTemplateMail, resolvePortalUrl } from '~~/server/utils/mailer'

/**
 * Portal-admin reset of a user's security password. The admin never sees or
 * sets the value - instead we clear the current secret and email the user a
 * single-use, time-boxed link to choose a new one. Clearing also means the
 * mandatory set-up prompt shows on their next login as a fallback if the email
 * never arrives. Returns whether the mail went out so the UI can warn the admin
 * (e.g. the account has no email address on file).
 */
export default defineEventHandler(async (event) => {
  const admin = await requireRole(event, 'admin')
  const id = getRouterParam(event, 'id')!
  const target = await getUserById(id)
  if (!target) throw createError({ statusCode: 404, statusMessage: 'User not found' })

  await clearSecurityPassword(id)
  const { token, ttlHours } = await createSecurityPasswordReset(id)
  await audit({ actor: admin.username, action: 'user.security_password.reset', target: target.username })

  let emailed = false
  let emailError: string | undefined
  if (target.email) {
    const base = resolvePortalUrl(event)
    const resetUrl = `${base}/security-password/reset?token=${token}`
    const result = await sendTemplateMail(
      'security-password-reset',
      target.email,
      {
        user: { displayName: target.displayName, username: target.username, email: target.email },
        resetUrl,
        expiryHours: String(ttlHours),
        actor: admin.username
      },
      { event }
    )
    emailed = result.ok
    emailError = result.ok ? undefined : result.error
  } else {
    emailError = 'This user has no email address on file'
  }

  return { id, securityPasswordSet: false, emailed, emailError }
})
