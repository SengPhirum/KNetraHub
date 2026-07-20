import { requireUser } from '~~/server/utils/auth'
import {
  hasSecurityPassword,
  verifySecurityPassword,
  setSecurityPassword,
  audit
} from '~~/server/utils/store'

// Minimum length for the security password. Kept deliberately simple (a length
// floor + confirmation match) rather than the full login password policy - it
// is a step-up confirmation secret that every account type, including SSO,
// must be able to set without fighting an identity-provider policy.
const MIN_LENGTH = 6

/**
 * Self-service: set or change the signed-in user's portal security password.
 * First-time set needs no current password; a change requires the current one.
 * Applies to every account type (local, LDAP, SSO) - this is a portal secret,
 * not the identity-provider login password.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody<{ current?: string; password?: string; confirm?: string }>(event)

  const password = typeof body?.password === 'string' ? body.password : ''
  const confirm = typeof body?.confirm === 'string' ? body.confirm : ''

  if (password.length < MIN_LENGTH) {
    throw createError({ statusCode: 400, statusMessage: `Security password must be at least ${MIN_LENGTH} characters` })
  }
  if (password !== confirm) {
    throw createError({ statusCode: 400, statusMessage: 'Security password and confirmation do not match' })
  }

  const already = await hasSecurityPassword(user.id)
  if (already) {
    const current = typeof body?.current === 'string' ? body.current : ''
    if (!current) throw createError({ statusCode: 400, statusMessage: 'Enter your current security password' })
    const ok = await verifySecurityPassword(user.id, current)
    if (!ok) throw createError({ statusCode: 403, statusMessage: 'Current security password is incorrect' })
  }

  await setSecurityPassword(user.id, password)
  await audit({ actor: user.username, action: already ? 'user.security_password.change' : 'user.security_password.set' })
  return { configured: true }
})
