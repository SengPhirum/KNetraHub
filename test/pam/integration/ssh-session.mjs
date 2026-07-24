#!/usr/bin/env node
// Real end-to-end proof of the PAM SSH session path (spec §3.2/§3.3/§19.3):
// browser WebSocket → gateway → real SSH target, with recording upload and
// manager-terminate revocation. Uses the built gateway binary, a disposable
// OpenSSH container, and a mock control plane. FAILS LOUDLY (non-zero exit) if
// any dependency is missing or an assertion does not hold — never a fake pass.
import http from 'node:http'
import net from 'node:net'
import { spawn, execFileSync } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SignJWT } from 'jose'

const SECRET = 'ssh-session-it-secret'
const AUD = 'knetrahub-pam-gateway'
const MOCK_PORT = 53080
const GW_PORT = 54222
const SSH_PORT = 52222
const SESSION = 'sess-it-1'
const ACCOUNT = 'acct-it-1'
const HERE = dirname(fileURLToPath(import.meta.url))
const GATEWAY_DIR = join(HERE, '..', '..', '..', 'services', 'pam', 'ssh-gateway')
const GW_BIN = process.env.GW_BIN || join(tmpdir(), process.platform === 'win32' ? 'pam-ssh-gateway.exe' : 'pam-ssh-gateway')
const IMAGE = 'pam-it-openssh:latest'
const CID = 'pam-it-ssh'

function ensureGateway() {
  if (existsSync(GW_BIN) && !process.env.GW_REBUILD) return
  console.log('[ssh-it] building gateway binary…')
  execFileSync('go', ['build', '-o', GW_BIN, '.'], {
    cwd: GATEWAY_DIR,
    env: { ...process.env, GOTOOLCHAIN: process.env.GOTOOLCHAIN || 'local', GOFLAGS: process.env.GOFLAGS || '-mod=mod' },
    stdio: 'inherit'
  })
}

function ensureImage() {
  const out = sh('docker', ['images', '-q', IMAGE])
  if (out.trim()) return
  console.log('[ssh-it] building disposable OpenSSH image…')
  execFileSync('docker', ['build', '-t', IMAGE, join(HERE, 'fixtures', 'openssh')], { stdio: 'inherit' })
}

const received = { ingest: [], recordings: [], statePolls: 0 }
let sessionState = 'active'
let failures = 0
function check(name, cond) {
  if (cond) { console.log(`  ✓ ${name}`) } else { console.error(`  ✗ ${name}`); failures++ }
}
function sh(cmd, args) { try { return execFileSync(cmd, args, { encoding: 'utf8' }) } catch (e) { return e.stdout || '' } }

async function waitPort(port, ms = 30000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const ok = await new Promise((r) => { const s = net.connect(port, '127.0.0.1', () => { s.destroy(); r(true) }); s.on('error', () => r(false)) })
    if (ok) return true
    await sleep(500)
  }
  return false
}

function startMockControlPlane() {
  const server = http.createServer((req, res) => {
    const url = req.url.split('?')[0]
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const body = Buffer.concat(chunks)
      if (url === '/api/pam/v1/gateway/checkout') {
        res.setHeader('content-type', 'application/json')
        return res.end(JSON.stringify({
          protocol: 'ssh',
          target: { host: '127.0.0.1', port: SSH_PORT },
          credential: { username: 'pamuser', value: 'InitialPass123', valueType: 'password' },
          idleTimeoutSeconds: 900, maxDurationSeconds: 14400
        }))
      }
      if (url === '/api/pam/v1/gateway/ingest') {
        try { received.ingest.push(JSON.parse(body.toString() || '{}')) } catch { /* ignore */ }
        return res.end(JSON.stringify({ ok: true }))
      }
      if (url === '/api/pam/v1/gateway/recording') {
        received.recordings.push({ size: body.length })
        return res.end(JSON.stringify({ ok: true, recordingId: 'r1', integrityOk: true }))
      }
      if (url === '/api/pam/v1/gateway/session-state') {
        received.statePolls++
        res.setHeader('content-type', 'application/json')
        return res.end(JSON.stringify({ state: sessionState, grantValid: sessionState === 'active' }))
      }
      res.statusCode = 404; res.end('nope')
    })
  })
  return new Promise((resolve) => server.listen(MOCK_PORT, '127.0.0.1', () => resolve(server)))
}

async function main() {
  ensureGateway()
  ensureImage()
  console.log('[ssh-it] starting disposable OpenSSH container…')
  sh('docker', ['rm', '-f', CID])
  sh('docker', ['run', '-d', '--name', CID, '-p', `${SSH_PORT}:22`, IMAGE])
  if (!await waitPort(SSH_PORT)) throw new Error('OpenSSH container did not open port')

  const mock = await startMockControlPlane()
  console.log('[ssh-it] mock control plane on', MOCK_PORT)

  console.log('[ssh-it] starting gateway…')
  const gw = spawn(GW_BIN, [], {
    env: { ...process.env, NUXT_JWT_SECRET: SECRET, PAM_CONTROL_PLANE_URL: `http://127.0.0.1:${MOCK_PORT}`, PAM_GATEWAY_LISTEN: `:${GW_PORT}`, PAM_HOSTKEY_TOFU: 'true' },
    stdio: 'inherit'
  })
  const cleanup = () => { try { gw.kill() } catch {} mock.close(); sh('docker', ['rm', '-f', CID]) }

  try {
    if (!await waitPort(GW_PORT)) throw new Error('gateway did not open port')
    await sleep(500)

    const token = await new SignJWT({ sessionId: SESSION, accountId: ACCOUNT, grantId: '', protocol: 'ssh', user: 'alice', jti: 'jti-it-1' })
      .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setAudience(AUD)
      .setExpirationTime(Math.floor(Date.now() / 1000) + 300).sign(new TextEncoder().encode(SECRET))

    let out = ''
    let closed = false
    const ws = new WebSocket(`ws://127.0.0.1:${GW_PORT}/session?token=${token}`)
    ws.binaryType = 'arraybuffer'
    ws.onmessage = (e) => { out += typeof e.data === 'string' ? e.data : Buffer.from(e.data).toString('utf8') }
    ws.onclose = () => { closed = true }
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = (e) => reject(new Error('ws error: ' + (e?.message || 'connect failed'))); setTimeout(() => reject(new Error('ws open timeout')), 15000) })
    console.log('[ssh-it] websocket connected; running whoami…')

    await sleep(1500) // shell/prompt ready
    ws.send('whoami\n')

    const deadline = Date.now() + 10000
    while (Date.now() < deadline && !/pamuser/.test(out)) await sleep(200)

    console.log('\n[ssh-it] === assertions ===')
    check('terminal shows real target output (whoami → pamuser)', /pamuser/.test(out))
    check('target credential NEVER sent to the browser/WS', !out.includes('InitialPass123'))
    check('gateway reported "connected" to the control plane', received.ingest.some((p) => (p.events || []).some((e) => e.kind === 'connected')))

    console.log('[ssh-it] manager terminates the session…')
    sessionState = 'terminated'
    const revDeadline = Date.now() + 8000
    while (Date.now() < revDeadline && !closed) await sleep(200)
    check('revocation propagated: live session closed within poll interval', closed)
    check('gateway polled session-state for revocation', received.statePolls > 0)

    await sleep(1500) // allow finalize + recording upload
    check('recording bytes were uploaded to the control plane', received.recordings.length > 0 && received.recordings[0].size > 0)
    const endedIngest = received.ingest.find((p) => p.state === 'ended' || (p.commands || []).length)
    check('command log captured "whoami"', !!endedIngest && (endedIngest.commands || []).some((c) => /whoami/.test(c.command || '')))

    try { ws.close() } catch {}
  } finally {
    cleanup()
  }

  console.log(`\n[ssh-it] ${failures === 0 ? 'PASS' : 'FAIL'} — ${failures} failed assertion(s)`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => { console.error('[ssh-it] ERROR', e); sh('docker', ['rm', '-f', CID]); process.exit(1) })
