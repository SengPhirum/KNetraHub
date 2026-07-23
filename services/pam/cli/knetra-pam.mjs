#!/usr/bin/env node
// knetra-pam — minimal CLI for the KNetraHub PAM secrets API.
//
// Authenticates with an application-identity token (see Applications → Issue
// token in the PAM UI) and retrieves an authorized secret over TLS. The value
// is printed to stdout only; it is never written to a file or logged. Intended
// for CI jobs and workloads that cannot use a native SDK.
//
// Usage:
//   KNETRA_PAM_URL=https://knetrahub.example.com \
//   KNETRA_PAM_TOKEN=pam_xxx \
//   knetra-pam get app/prod/db
//
//   knetra-pam get --path app/prod/db --field password   # if the value is JSON
//   knetra-pam whoami                                      # validate the token
//
// Flags: --url, --token, --version <n>, --field <key>, --json
import process from 'node:process'

function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) { const k = a.slice(2); const v = argv[i + 1]?.startsWith('--') ? true : argv[++i]; args[k] = v ?? true }
    else args._.push(a)
  }
  return args
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2)
  const args = parseArgs(rest)
  const baseUrl = (args.url || process.env.KNETRA_PAM_URL || '').replace(/\/$/, '')
  const token = args.token || process.env.KNETRA_PAM_TOKEN || ''
  if (!baseUrl) fail('Set KNETRA_PAM_URL or pass --url')
  if (!token) fail('Set KNETRA_PAM_TOKEN or pass --token')

  if (cmd === 'get') {
    const path = args.path || args._[0]
    if (!path) fail('Usage: knetra-pam get <path>')
    const res = await fetch(`${baseUrl}/api/pam/v1/secrets/retrieve`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ path, version: args.version ? Number(args.version) : undefined })
    })
    if (!res.ok) fail(`Retrieve failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
    const data = await res.json()
    if (args.json) { process.stdout.write(JSON.stringify(data)); return }
    if (args.field) {
      let obj; try { obj = JSON.parse(data.value) } catch { fail('Secret value is not JSON; drop --field') }
      process.stdout.write(String(obj[args.field] ?? ''))
    } else {
      process.stdout.write(data.value)
    }
    return
  }

  if (cmd === 'whoami') {
    // A denied retrieve of a non-existent path still proves the token is valid
    // (401 = bad token; 403/404 = valid token).
    const res = await fetch(`${baseUrl}/api/pam/v1/secrets/retrieve`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ path: '__whoami_probe__' })
    })
    if (res.status === 401) fail('Token is invalid or expired')
    console.log(res.status === 404 || res.status === 403 ? 'Token is valid' : `Unexpected status ${res.status}`)
    return
  }

  console.log('knetra-pam <get|whoami> [--url URL] [--token TOKEN] [--field KEY] [--version N] [--json]')
}

function fail(msg) { process.stderr.write(`knetra-pam: ${msg}\n`); process.exit(1) }
main().catch((e) => fail(e?.message || String(e)))
