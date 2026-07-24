// KNetraHub PAM — MySQL / MariaDB connector (runner bundle).
//
// Manages MySQL/MariaDB account credentials. A `change` uses ALTER USER with
// bound string literals (no SQL injection from a generated password) via a
// privileged logon account, then independently re-connects as the target user
// with the new credential before reporting `verified`.
import mysql from 'mysql2/promise'

function conn(ctx, useLogon) {
  const password = useLogon && ctx.logonCredential ? ctx.logonCredential : ctx.currentCredential
  const user = useLogon && ctx.config?.logonUsername ? ctx.config.logonUsername : ctx.username
  return mysql.createConnection({
    host: ctx.address, port: ctx.port || 3306, user, password,
    database: ctx.config?.database, connectTimeout: 12000,
    ssl: ctx.config?.ssl ? { rejectUnauthorized: ctx.config?.tlsRejectUnauthorized !== false } : undefined
  })
}

const hostPart = (ctx) => ctx.config?.userHost || '%'

async function testAction(ctx) {
  let c
  try { c = await conn(ctx, true); await c.query('SELECT 1'); return { ok: true, action: 'test', detail: 'connection ok' } }
  catch (e) { return { ok: false, action: 'test', retryable: true, detail: String(e.message || e) } }
  finally { await c?.end().catch(() => {}) }
}

async function verifyAction(ctx) {
  let c
  try { c = await conn(ctx, false); await c.query('SELECT 1'); return { ok: true, action: 'verify', verified: true, detail: 'current credential authenticates' } }
  catch (e) { return { ok: false, action: 'verify', verified: false, retryable: false, detail: `auth failed: ${e.message || e}` } }
  finally { await c?.end().catch(() => {}) }
}

async function changeAction(ctx) {
  const newPass = ctx.newCredential
  if (!newPass) return { ok: false, action: 'change', retryable: false, detail: 'no new credential' }
  const useLogon = !!ctx.logonCredential
  let c
  try {
    c = await conn(ctx, useLogon)
    // ALTER USER 'user'@'host' IDENTIFIED BY 'newpass' — placeholders bind as
    // quoted string literals, so the generated password cannot inject SQL.
    await c.query('ALTER USER ?@? IDENTIFIED BY ?', [ctx.username, hostPart(ctx), newPass])
    await c.query('FLUSH PRIVILEGES').catch(() => {})
    await c.end(); c = undefined
  } catch (e) {
    await c?.end().catch(() => {})
    return { ok: false, action: 'change', targetChanged: false, retryable: true, detail: `ALTER USER failed: ${e.message || e}` }
  }
  let v
  try {
    v = await mysql.createConnection({ host: ctx.address, port: ctx.port || 3306, user: ctx.username, password: newPass, database: ctx.config?.database, connectTimeout: 10000 })
    await v.query('SELECT 1')
    return { ok: true, action: 'change', targetChanged: true, verified: true, detail: 'password changed and independently re-authenticated' }
  } catch (e) {
    return { ok: false, action: 'change', targetChanged: true, verified: false, retryable: false, detail: `changed but new credential did not authenticate: ${e.message || e}` }
  } finally { await v?.end().catch(() => {}) }
}

async function reconcileAction(ctx) {
  if (!ctx.logonCredential) return { ok: false, action: 'reconcile', retryable: false, detail: 'reconcile requires a privileged logon account' }
  return changeAction(ctx)
}

async function discoverAction(ctx) {
  let c
  try {
    c = await conn(ctx, true)
    const [rows] = await c.query("SELECT User AS user, Host AS host FROM mysql.user WHERE User <> ''")
    const accounts = rows.map((r) => ({ username: r.user ?? r.User, host: r.host ?? r.Host, account_type: 'mysql', privilege_level: (r.user ?? r.User) === 'root' ? 'root' : 'user' }))
    return { ok: true, action: 'discover', accounts, detail: `discovered ${accounts.length} database accounts` }
  } catch (e) { return { ok: false, action: 'discover', accounts: [], retryable: true, detail: String(e.message || e) } }
  finally { await c?.end().catch(() => {}) }
}

export default {
  key: 'mysql',
  test: testAction,
  verify: verifyAction,
  change: changeAction,
  rotate: changeAction,
  reconcile: reconcileAction,
  discover: discoverAction
}
