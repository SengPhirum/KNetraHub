import { ldapAuthenticate } from '~~/server/utils/ldap'
import { verifyLocalUser, upsertLdapUser, touchLogin, audit } from '~~/server/utils/store'
import { setSession } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const { username, password } = await readBody<{ username: string; password: string }>(event)
  if (!username || !password) {
    throw createError({ statusCode: 400, statusMessage: 'Username and password are required' })
  }

  const cfg = useRuntimeConfig()
  let session

  // 1. Try LDAP first when enabled
  if (cfg.ldap.enabled) {
    try {
      const ldapUser = await ldapAuthenticate(username, password)
      const stored = await upsertLdapUser(ldapUser)
      session = {
        id: stored.id,
        username: stored.username,
        displayName: stored.displayName,
        role: stored.role,
        source: 'ldap' as const
      }
    } catch (err: any) {
      // fall through to local auth on auth failure; surface infra errors
      if (err?.statusCode && err.statusCode !== 401) throw err
    }
  }

  // 2. Local users (always available, e.g. the seeded admin)
  if (!session) {
    const local = await verifyLocalUser(username, password)
    if (local) {
      session = {
        id: local.id,
        username: local.username,
        displayName: local.displayName,
        role: local.role,
        source: 'local' as const
      }
    }
  }

  if (!session) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid username or password' })
  }

  await touchLogin(session.username)
  await setSession(event, session)
  await audit({ actor: session.username, action: 'auth.login', detail: `via ${session.source}` })

  return { user: session }
})
