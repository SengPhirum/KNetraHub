// KNetraHub PAM — Linux/Unix SSH connector (runner bundle).
//
// Performs the credential lifecycle against a Linux/Unix target over SSH using
// the `ssh2` transport. Loaded ONLY by the out-of-process connector-runner
// after digest+signature verification. Every action returns the structured
// ConnectorRunResult; a `change` is reported as verified ONLY after an
// independent re-login with the new credential succeeds — so the control plane
// never seals a credential the target did not actually accept.
//
// Password changes are applied with `chpasswd` over the exec channel's stdin
// (never interpolated into a shell command), so a generated password with shell
// metacharacters cannot cause injection.
import { Client } from 'ssh2'

function connect({ host, port, username, password, privateKey, passphrase }) {
  return new Promise((resolve, reject) => {
    const c = new Client()
    const timer = setTimeout(() => { c.end(); reject(new Error('connect timeout')) }, 15000)
    c.on('ready', () => { clearTimeout(timer); resolve(c) })
    c.on('error', (e) => { clearTimeout(timer); reject(e) })
    c.connect({
      host, port: port || 22, username,
      ...(privateKey ? { privateKey, passphrase } : { password }),
      readyTimeout: 12000, keepaliveInterval: 0
    })
  })
}

function exec(conn, command, stdin) {
  return new Promise((resolve, reject) => {
    conn.exec(command, { pty: false }, (err, stream) => {
      if (err) return reject(err)
      let out = '', errout = ''
      stream.on('close', (code) => resolve({ code, out, errout }))
        .on('data', (d) => { out += d.toString() })
        .stderr.on('data', (d) => { errout += d.toString() })
      if (stdin !== undefined) { stream.write(stdin); stream.end() }
    })
  })
}

function creds(ctx, useLogon) {
  const value = useLogon && ctx.logonCredential ? ctx.logonCredential : ctx.currentCredential
  const isKey = /BEGIN [A-Z ]*PRIVATE KEY/.test(String(value || ''))
  return {
    host: ctx.address, port: ctx.port, username: useLogon && ctx.config?.logonUsername ? ctx.config.logonUsername : ctx.username,
    ...(isKey ? { privateKey: value, passphrase: ctx.config?.passphrase } : { password: value })
  }
}

async function testAction(ctx) {
  let c
  try { c = await connect(creds(ctx)); const r = await exec(c, 'echo pam-ok'); return { ok: r.out.includes('pam-ok'), action: 'test', detail: 'connection ok' } }
  catch (e) { return { ok: false, action: 'test', retryable: true, detail: String(e.message || e) } }
  finally { c?.end() }
}

async function verifyAction(ctx) {
  let c
  try { c = await connect(creds(ctx)); await exec(c, 'id'); return { ok: true, action: 'verify', verified: true, detail: 'current credential authenticates' } }
  catch (e) { return { ok: false, action: 'verify', verified: false, retryable: false, detail: `authentication failed: ${e.message || e}` } }
  finally { c?.end() }
}

async function changeAction(ctx) {
  const target = ctx.username
  const newPass = ctx.newCredential
  if (!newPass) return { ok: false, action: 'change', retryable: false, detail: 'no new credential provided' }
  // Apply the change using the current credential (self) or a privileged logon
  // account (reconcile). chpasswd reads user:password from stdin — no shell interpolation.
  const useLogon = !!ctx.logonCredential
  let c
  try {
    c = await connect(creds(ctx, useLogon))
    const sudo = useLogon || ctx.config?.useSudo !== false ? 'sudo ' : ''
    const r = await exec(c, `${sudo}chpasswd`, `${target}:${newPass}\n`)
    c.end(); c = undefined
    if (r.code !== 0) return { ok: false, action: 'change', targetChanged: false, retryable: false, detail: `chpasswd exited ${r.code}: ${r.errout.slice(0, 200)}` }
  } catch (e) {
    c?.end()
    return { ok: false, action: 'change', targetChanged: false, retryable: true, detail: `change failed: ${e.message || e}` }
  }
  // Independent verification: a FRESH login with the new credential must succeed.
  let v
  try {
    v = await connect({ host: ctx.address, port: ctx.port, username: target, password: newPass })
    await exec(v, 'id')
    return { ok: true, action: 'change', targetChanged: true, verified: true, detail: 'password changed and independently re-authenticated' }
  } catch (e) {
    return { ok: false, action: 'change', targetChanged: true, verified: false, retryable: false, detail: `target changed but new credential did not authenticate: ${e.message || e}` }
  } finally { v?.end() }
}

async function reconcileAction(ctx) {
  // Reconcile == change driven by the privileged logon account when the current
  // credential is unknown/broken.
  if (!ctx.logonCredential) return { ok: false, action: 'reconcile', retryable: false, detail: 'reconcile requires a linked logon account' }
  return changeAction({ ...ctx })
}

async function discoverAction(ctx) {
  let c
  try {
    c = await connect(creds(ctx))
    const passwd = await exec(c, "getent passwd || cat /etc/passwd")
    const accounts = []
    for (const line of passwd.out.split('\n')) {
      const [user, , uid, , , , shell] = line.split(':')
      if (!user) continue
      const numUid = Number(uid)
      const interactive = shell && !/(nologin|false)$/.test(shell)
      if (interactive || numUid === 0) accounts.push({ username: user, account_type: 'linux', privilege_level: numUid === 0 ? 'root' : 'user', uid: numUid })
    }
    return { ok: true, action: 'discover', accounts, detail: `discovered ${accounts.length} interactive accounts` }
  } catch (e) { return { ok: false, action: 'discover', accounts: [], retryable: true, detail: String(e.message || e) } }
  finally { c?.end() }
}

export default {
  key: 'linux-ssh',
  test: testAction,
  verify: verifyAction,
  change: changeAction,
  rotate: changeAction,
  reconcile: reconcileAction,
  discover: discoverAction
}
