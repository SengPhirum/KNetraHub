import { requireRole } from '~~/server/utils/auth'
import { resetAuthSettings } from '~~/server/utils/authSettings'
import { audit } from '~~/server/utils/store'

/** Remove the DB override; the provider follows environment variables again. */
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const provider = getQuery(event).provider

  if (provider !== 'local' && provider !== 'ldap' && provider !== 'oidc') {
    throw createError({ statusCode: 400, statusMessage: 'Expected ?provider=local, ldap, or oidc' })
  }

  await resetAuthSettings(provider)
  await audit({ actor: user.username, action: 'settings.auth.reset', target: provider, detail: 'reverted to environment defaults' })
  return { ok: true }
})
