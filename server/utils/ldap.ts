import { Client } from 'ldapts'
import type { Role } from './store'
import { getLdapSettings } from './authSettings'
import type { LdapSettings } from './authSettings'
import { logSystem } from './moduleLogs'

export interface LdapResult {
  username: string
  displayName: string
  email?: string
  role: Role
}

/**
 * Authenticate against LDAP / Active Directory.
 *
 * Strategy: bind with a service account, search for the user, then
 * re-bind as the found DN with the supplied password to verify it.
 * Group membership maps to a KNetraHub role.
 */
export async function ldapAuthenticate(username: string, password: string): Promise<LdapResult> {
  const cfg = await getLdapSettings()
  if (!cfg.enabled) {
    throw createError({ statusCode: 400, statusMessage: 'LDAP is not enabled' })
  }

  const client = new Client({ url: cfg.url, timeout: 8000, connectTimeout: 8000 })

  try {
    // 1. bind as the service account (or anonymous if none configured)
    if (cfg.bindDN) {
      await client.bind(cfg.bindDN, cfg.bindCredentials)
    }

    // 2. search for the user entry
    const filter = cfg.searchFilter.replace('{{username}}', escapeFilter(username))
    const { searchEntries } = await client.search(cfg.searchBase, {
      scope: 'sub',
      filter,
      attributes: ['dn', 'cn', 'displayName', 'mail', 'uid', 'sAMAccountName', 'memberOf']
    })

    if (searchEntries.length === 0) {
      throw createError({ statusCode: 401, statusMessage: 'Invalid credentials' })
    }
    const entry = searchEntries[0]
    const userDN = entry.dn

    // 3. verify the password by binding as the user
    await client.unbind()
    const verifyClient = new Client({ url: cfg.url, timeout: 8000 })
    try {
      await verifyClient.bind(userDN, password)
    } catch {
      throw createError({ statusCode: 401, statusMessage: 'Invalid credentials' })
    } finally {
      await verifyClient.unbind().catch(() => {})
    }

    // 4. resolve role from group membership
    const role = resolveRole(entry, cfg)

    const displayName =
      str(entry.displayName) || str(entry.cn) || username
    const email = str(entry.mail) || undefined

    return { username, displayName, email, role }
  } catch (err: any) {
    // Credential failures are thrown as H3 401s above; anything without a
    // statusCode is LDAP infrastructure trouble - worth surfacing, because
    // the login flow then silently falls back to local users.
    if (!err?.statusCode) {
      await logSystem('portal', 'warning', 'ldap.unavailable',
        `LDAP ${cfg.url} bind/search failed: ${err?.message || err}`)
    }
    throw err
  } finally {
    await client.unbind().catch(() => {})
  }
}

function resolveRole(entry: any, cfg: LdapSettings): Role {
  // Use memberOf attribute when present (typical for AD)
  const memberOf = ([] as string[]).concat(entry.memberOf || []).map((g: string) => g.toLowerCase())
  const admin = cfg.adminGroup?.toLowerCase()
  const operator = cfg.operatorGroup?.toLowerCase()

  if (admin && memberOf.some((g) => g.includes(admin))) return 'admin'
  if (operator && memberOf.some((g) => g.includes(operator))) return 'operator'

  // Default for authenticated LDAP users without a matched group
  return 'viewer'
}

function str(v: unknown): string {
  if (Array.isArray(v)) return String(v[0] ?? '')
  if (Buffer.isBuffer(v)) return v.toString('utf8')
  return v == null ? '' : String(v)
}

// minimal RFC4515 escaping
function escapeFilter(s: string): string {
  return s.replace(/[*()\\\0]/g, (c) => '\\' + c.charCodeAt(0).toString(16).padStart(2, '0'))
}
