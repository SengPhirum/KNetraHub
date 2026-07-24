// KNetraHub PAM — MongoDB connector (runner bundle).
//
// Manages MongoDB account credentials via the updateUser command (driven by a
// privileged logon account), then independently re-authenticates as the target
// with the new credential before reporting `verified`. The password is passed
// as a command field (BSON), never string-concatenated.
import { MongoClient } from 'mongodb'

function uri(ctx) {
  const scheme = ctx.config?.srv ? 'mongodb+srv' : 'mongodb'
  return ctx.config?.uri || `${scheme}://${ctx.address}:${ctx.port || 27017}`
}

async function client(ctx, useLogon) {
  const username = useLogon ? (ctx.config?.logonUsername || ctx.username) : ctx.username
  const password = useLogon && ctx.logonCredential ? ctx.logonCredential : ctx.currentCredential
  const authSource = useLogon ? (ctx.config?.logonAuthSource || 'admin') : (ctx.config?.authSource || 'admin')
  const c = new MongoClient(uri(ctx), {
    auth: { username, password }, authSource,
    serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000,
    tls: !!ctx.config?.tls, tlsAllowInvalidCertificates: ctx.config?.tlsRejectUnauthorized === false
  })
  await c.connect()
  return c
}

const userDb = (ctx) => ctx.config?.authSource || 'admin'

async function testAction(ctx) {
  let c
  try { c = await client(ctx, true); await c.db('admin').command({ ping: 1 }); return { ok: true, action: 'test', detail: 'connection ok' } }
  catch (e) { return { ok: false, action: 'test', retryable: true, detail: String(e.message || e) } }
  finally { await c?.close().catch(() => {}) }
}

async function verifyAction(ctx) {
  let c
  try { c = await client(ctx, false); await c.db(userDb(ctx)).command({ ping: 1 }); return { ok: true, action: 'verify', verified: true, detail: 'current credential authenticates' } }
  catch (e) { return { ok: false, action: 'verify', verified: false, retryable: false, detail: `auth failed: ${e.message || e}` } }
  finally { await c?.close().catch(() => {}) }
}

async function changeAction(ctx) {
  const newPass = ctx.newCredential
  if (!newPass) return { ok: false, action: 'change', retryable: false, detail: 'no new credential' }
  let c
  try {
    c = await client(ctx, true)
    await c.db(userDb(ctx)).command({ updateUser: ctx.username, pwd: newPass })
    await c.close(); c = undefined
  } catch (e) {
    await c?.close().catch(() => {})
    return { ok: false, action: 'change', targetChanged: false, retryable: true, detail: `updateUser failed: ${e.message || e}` }
  }
  let v
  try {
    v = new MongoClient(uri(ctx), { auth: { username: ctx.username, password: newPass }, authSource: userDb(ctx), serverSelectionTimeoutMS: 8000 })
    await v.connect(); await v.db(userDb(ctx)).command({ ping: 1 })
    return { ok: true, action: 'change', targetChanged: true, verified: true, detail: 'password changed and independently re-authenticated' }
  } catch (e) {
    return { ok: false, action: 'change', targetChanged: true, verified: false, retryable: false, detail: `changed but new credential did not authenticate: ${e.message || e}` }
  } finally { await v?.close().catch(() => {}) }
}

async function reconcileAction(ctx) {
  if (!ctx.logonCredential) return { ok: false, action: 'reconcile', retryable: false, detail: 'reconcile requires a privileged logon account' }
  return changeAction(ctx)
}

async function discoverAction(ctx) {
  let c
  try {
    c = await client(ctx, true)
    const res = await c.db(userDb(ctx)).command({ usersInfo: 1 })
    const accounts = (res.users || []).map((u) => ({ username: u.user, db: u.db, account_type: 'mongodb', privilege_level: (u.roles || []).some((r) => /admin|root/i.test(r.role)) ? 'admin' : 'user', roles: u.roles }))
    return { ok: true, action: 'discover', accounts, detail: `discovered ${accounts.length} database accounts` }
  } catch (e) { return { ok: false, action: 'discover', accounts: [], retryable: true, detail: String(e.message || e) } }
  finally { await c?.close().catch(() => {}) }
}

export default {
  key: 'mongodb',
  test: testAction,
  verify: verifyAction,
  change: changeAction,
  rotate: changeAction,
  reconcile: reconcileAction,
  discover: discoverAction
}
