import { ldapAuthenticate } from '~~/server/utils/ldap'
import { getLdapSettings } from '~~/server/utils/authSettings'
import { verifyLocalUser, upsertExternalUser, touchLogin, audit } from '~~/server/utils/store'
import { setSession, resolveUserEntitlements } from '~~/server/utils/auth'
import { logSystem } from '~~/server/utils/moduleLogs'
import { firePortalAlert, noteFailedLogin, clearFailedLogins } from '~~/server/utils/portalAlertNotify'

export default defineEventHandler(async (event) => {
  const { username, password } = await readBody<{ username: string; password: string }>(event)
  if (!username || !password) {
    throw createError({ statusCode: 400, statusMessage: 'Username and password are required' })
  }

  const ldapCfg = await getLdapSettings()
  let session

  // 1. Try LDAP first when enabled
  if (ldapCfg.enabled) {
    try {
      const ldapUser = await ldapAuthenticate(username, password)
      const stored = await upsertExternalUser({ ...ldapUser, source: 'ldap' })
      session = {
        id: stored.id,
        username: stored.username,
        displayName: stored.displayName,
        role: stored.role,
        source: 'ldap' as const,
        // LDAP carries no Keycloak realm roles today; per-app access for LDAP
        // users is a documented follow-up. They get no apps unless promoted to
        // a local admin.
        realmRoles: [] as string[]
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
        source: 'local' as const,
        realmRoles: [] as string[],
        appAccess: local.appAccess
      }
    }
  }

  if (!session) {
    await logSystem('portal', 'warning', 'auth.login.failed', `Failed login attempt for "${username}"`)
    // Portal alert: fires once a username hits the configured consecutive-failure
    // threshold (brute-force signal). Never throws.
    await noteFailedLogin(username)
    throw createError({ statusCode: 401, statusMessage: 'Invalid username or password' })
  }

  clearFailedLogins(session.username)
  await touchLogin(session.username)
  await setSession(event, session)
  await audit({ actor: session.username, action: 'auth.login', detail: `via ${session.source}` })
  await logSystem('portal', 'info', 'auth.login', `${session.username} signed in via ${session.source}`)

  if (session.role === 'admin') {
    void firePortalAlert({
      ruleType: 'admin_login',
      target: session.username,
      severity: 'info',
      vars: { target: session.username, source: session.source, time: new Date().toISOString() }
    })
  }

  const apps = await resolveUserEntitlements(session)
  return { user: { ...session, apps } }
})
