// KNetraHub PAM — Active Directory / LDAP connector (runner bundle).
//
// Manages directory accounts over LDAP(S). Defaults to LDAPS; plain ldap:// is
// refused unless config.allowInsecure is explicitly set (test/lab only). Works
// against OpenLDAP (userPassword) and Active Directory (unicodePwd over TLS).
// A `change` is reported verified ONLY after an independent bind with the new
// credential succeeds.
import { Client, Change, Attribute } from 'ldapts'

function targetDn(ctx) {
  if (ctx.config?.userDn) return ctx.config.userDn
  if (ctx.config?.userDnTemplate) return ctx.config.userDnTemplate.replace('{username}', ctx.username)
  const base = ctx.config?.usersBaseDn || ctx.config?.baseDn || ''
  const attr = ctx.config?.userIdAttr || 'uid'
  return `${attr}=${ctx.username},${base}`
}

function makeClient(ctx) {
  const url = ctx.config?.url || (ctx.address ? `ldaps://${ctx.address}:${ctx.port || 636}` : '')
  if (!url) throw new Error('no LDAP url/address configured')
  if (url.startsWith('ldap://') && !ctx.config?.allowInsecure) {
    throw new Error('refusing plaintext ldap:// (LDAPS required; set config.allowInsecure for lab use)')
  }
  const tlsOptions = url.startsWith('ldaps://')
    ? { rejectUnauthorized: ctx.config?.tlsRejectUnauthorized !== false }
    : undefined
  return new Client({ url, tlsOptions, timeout: 12000, connectTimeout: 12000 })
}

/** Encode a password for AD's unicodePwd (UTF-16LE, quote-wrapped). */
function adPassword(pw) { return Buffer.from(`"${pw}"`, 'utf16le') }

async function withAdmin(ctx, fn) {
  const client = makeClient(ctx)
  const bindDn = ctx.config?.bindDn || ctx.config?.adminDn
  const bindPw = ctx.logonCredential || ctx.config?.bindPassword
  if (!bindDn || !bindPw) throw new Error('admin/logon bind credentials required')
  try { await client.bind(bindDn, bindPw); return await fn(client) }
  finally { await client.unbind().catch(() => {}) }
}

async function bindAs(ctx, dn, password) {
  const client = makeClient(ctx)
  try { await client.bind(dn, password); return true }
  catch { return false }
  finally { await client.unbind().catch(() => {}) }
}

async function testAction(ctx) {
  try { const ok = await withAdmin(ctx, async () => true); return { ok, action: 'test', detail: 'admin bind ok' } }
  catch (e) { return { ok: false, action: 'test', retryable: true, detail: String(e.message || e) } }
}

async function verifyAction(ctx) {
  try {
    const ok = await bindAs(ctx, targetDn(ctx), ctx.currentCredential)
    return { ok, action: 'verify', verified: ok, detail: ok ? 'current credential binds' : 'bind failed' }
  } catch (e) { return { ok: false, action: 'verify', verified: false, retryable: false, detail: String(e.message || e) } }
}

async function changeAction(ctx) {
  const dn = targetDn(ctx)
  const newPass = ctx.newCredential
  if (!newPass) return { ok: false, action: 'change', retryable: false, detail: 'no new credential' }
  try {
    await withAdmin(ctx, async (client) => {
      const change = ctx.config?.isAD
        ? new Change({ operation: 'replace', modification: new Attribute({ type: 'unicodePwd', values: [adPassword(newPass)] }) })
        : new Change({ operation: 'replace', modification: new Attribute({ type: 'userPassword', values: [newPass] }) })
      await client.modify(dn, change)
    })
  } catch (e) {
    return { ok: false, action: 'change', targetChanged: false, retryable: true, detail: `modify failed: ${e.message || e}` }
  }
  const verified = await bindAs(ctx, dn, newPass)
  return verified
    ? { ok: true, action: 'change', targetChanged: true, verified: true, detail: 'password changed and independently re-bound' }
    : { ok: false, action: 'change', targetChanged: true, verified: false, retryable: false, detail: 'changed but new credential did not bind' }
}

async function discoverAction(ctx) {
  try {
    const accounts = await withAdmin(ctx, async (client) => {
      const base = ctx.config?.usersBaseDn || ctx.config?.baseDn
      const filter = ctx.config?.userFilter || (ctx.config?.isAD ? '(&(objectClass=user)(objectCategory=person))' : '(objectClass=inetOrgPerson)')
      const { searchEntries } = await client.search(base, { scope: 'sub', filter, attributes: ['uid', 'cn', 'sAMAccountName', 'memberOf', 'userAccountControl'] })
      // LDAP attrs can be arrays (incl. EMPTY arrays, which are truthy) — pick
      // the first present scalar rather than relying on `||`.
      const first = (v) => (Array.isArray(v) ? (v.length ? v[0] : undefined) : v)
      const groupsOf = (v) => (Array.isArray(v) ? v : v ? [v] : [])
      return searchEntries.map((e) => ({
        username: String(first(e.sAMAccountName) || first(e.uid) || first(e.cn) || ''),
        dn: e.dn,
        account_type: ctx.config?.isAD ? 'ad' : 'ldap',
        privileged_group: groupsOf(e.memberOf).length > 0,
        groups: groupsOf(e.memberOf)
      })).filter((a) => a.username)
    })
    return { ok: true, action: 'discover', accounts, detail: `discovered ${accounts.length} directory accounts` }
  } catch (e) { return { ok: false, action: 'discover', accounts: [], retryable: true, detail: String(e.message || e) } }
}

async function reconcileAction(ctx) {
  if (!ctx.logonCredential && !ctx.config?.bindPassword) return { ok: false, action: 'reconcile', retryable: false, detail: 'reconcile requires an admin/logon bind account' }
  return changeAction(ctx)
}

export default {
  key: 'ad-ldap',
  test: testAction,
  verify: verifyAction,
  change: changeAction,
  rotate: changeAction,
  reconcile: reconcileAction,
  discover: discoverAction
}
