import { adminExists, createLocalUser, audit } from '~~/server/utils/store'
import { getLdapSettings, getOidcSettings } from '~~/server/utils/authSettings'
import { enforcePasswordPolicy } from '~~/server/utils/passwordPolicy'

/** Unauthenticated: creates the first admin account for the first-run setup
 *  wizard. Re-checks server-side (not just trusting the client's earlier
 *  /api/auth/setup-status read) so this can't be replayed to add a second
 *  admin once setup is already done. */
export default defineEventHandler(async (event) => {
  const [hasAdmin, ldap, oidc] = await Promise.all([
    adminExists(),
    getLdapSettings(),
    getOidcSettings()
  ])
  if (hasAdmin || ldap.enabled || oidc.enabled) {
    throw createError({ statusCode: 403, statusMessage: 'Setup has already been completed' })
  }

  const body = await readBody<{ username?: string; displayName?: string; password?: string }>(event)
  const username = body.username?.trim()
  const password = body.password ?? ''
  if (!username || username.length < 3) {
    throw createError({ statusCode: 400, statusMessage: 'Username must be at least 3 characters' })
  }
  await enforcePasswordPolicy(password)

  const user = await createLocalUser({
    username,
    displayName: body.displayName?.trim() || username,
    role: 'admin',
    password
  })
  await audit({ actor: user.username, action: 'setup.complete', target: user.username, detail: 'First-run admin account created' })
  return { ok: true }
})
