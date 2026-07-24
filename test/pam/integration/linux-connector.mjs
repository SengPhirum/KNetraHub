#!/usr/bin/env node
// Real proof of the Linux SSH connector (spec §4.1 / §19.2): change a live
// account's password on a disposable OpenSSH target, then confirm the NEW
// credential authenticates and the OLD one no longer does. Fails loudly.
import net from 'node:net'
import { execFileSync } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'ssh2'
import connector from '../../../services/pam/connector-runner/connectors/linux-ssh/1.0.0/index.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const IMAGE = 'pam-it-openssh:latest'
const CID = 'pam-it-ssh'
const SSH_PORT = 52222
let failures = 0
const check = (n, c) => { if (c) console.log(`  ✓ ${n}`); else { console.error(`  ✗ ${n}`); failures++ } }
const sh = (c, a) => { try { return execFileSync(c, a, { encoding: 'utf8' }) } catch (e) { return e.stdout || '' } }

async function waitPort(port, ms = 30000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await new Promise((r) => { const s = net.connect(port, '127.0.0.1', () => { s.destroy(); r(true) }); s.on('error', () => r(false)) })) return true
    await sleep(500)
  }
  return false
}

function canLogin(username, password) {
  return new Promise((resolve) => {
    const c = new Client()
    const t = setTimeout(() => { c.end(); resolve(false) }, 10000)
    c.on('ready', () => { clearTimeout(t); c.end(); resolve(true) })
    c.on('error', () => { clearTimeout(t); resolve(false) })
    c.connect({ host: '127.0.0.1', port: SSH_PORT, username, password, readyTimeout: 8000 })
  })
}

async function main() {
  if (!sh('docker', ['images', '-q', IMAGE]).trim()) {
    execFileSync('docker', ['build', '-t', IMAGE, join(HERE, 'fixtures', 'openssh')], { stdio: 'inherit' })
  }
  sh('docker', ['rm', '-f', CID])
  sh('docker', ['run', '-d', '--name', CID, '-p', `${SSH_PORT}:22`, IMAGE])
  if (!await waitPort(SSH_PORT)) throw new Error('OpenSSH container did not open port')
  await sleep(1000)

  const oldPass = 'InitialPass123'
  const newPass = 'Rotated_' + Math.random().toString(36).slice(2, 10) + '#9'
  const ctx = { address: '127.0.0.1', port: SSH_PORT, username: 'pamuser', currentCredential: oldPass, config: { useSudo: true }, log: () => {} }

  try {
    console.log('\n[linux-it] === connector actions against real target ===')
    check('test connection succeeds', (await connector.test(ctx)).ok === true)
    check('verify with current credential succeeds', (await connector.verify(ctx)).ok === true)

    const changed = await connector.change({ ...ctx, newCredential: newPass })
    check('change reports ok + targetChanged + verified', changed.ok === true && changed.targetChanged === true && changed.verified === true)

    // Independent confirmation (not via the connector):
    check('NEW password authenticates over SSH', await canLogin('pamuser', newPass))
    check('OLD password is REJECTED over SSH', !(await canLogin('pamuser', oldPass)))

    // verify() with the new credential should now succeed; with the old, fail.
    check('connector.verify with new credential ok', (await connector.verify({ ...ctx, currentCredential: newPass })).ok === true)
    check('connector.verify with old credential fails', (await connector.verify({ ...ctx, currentCredential: oldPass })).ok === false)

    const disc = await connector.discover({ ...ctx, currentCredential: newPass })
    check('discover finds pamuser and root', disc.ok && disc.accounts.some((a) => a.username === 'pamuser') && disc.accounts.some((a) => a.username === 'root'))
  } finally {
    sh('docker', ['rm', '-f', CID])
  }

  console.log(`\n[linux-it] ${failures === 0 ? 'PASS' : 'FAIL'} — ${failures} failed assertion(s)`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => { console.error('[linux-it] ERROR', e); sh('docker', ['rm', '-f', CID]); process.exit(1) })
