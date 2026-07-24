#!/usr/bin/env node
// Real proof of the AD/LDAP connector (spec §4.2) against a disposable OpenLDAP:
// change a directory account's password, then confirm the NEW credential binds
// and the OLD one no longer does. Fails loudly.
import net from 'node:net'
import { execFileSync } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import connector from '../../../services/pam/connector-runner/connectors/ad-ldap/1.0.0/index.mjs'

const CID = 'pam-it-ldap'
const PORT = 1389
const ROOT = 'dc=example,dc=org'
let failures = 0
const check = (n, c) => { if (c) console.log(`  ✓ ${n}`); else { console.error(`  ✗ ${n}`); failures++ } }
const sh = (c, a) => { try { return execFileSync(c, a, { encoding: 'utf8' }) } catch (e) { return e.stdout || '' } }

async function waitPort(port, ms = 45000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await new Promise((r) => { const s = net.connect(port, '127.0.0.1', () => { s.destroy(); r(true) }); s.on('error', () => r(false)) })) return true
    await sleep(500)
  }
  return false
}

async function main() {
  sh('docker', ['rm', '-f', CID])
  console.log('[ldap-it] starting disposable OpenLDAP…')
  sh('docker', ['run', '-d', '--name', CID, '-p', `${PORT}:1389`,
    '-e', 'LDAP_ADMIN_USERNAME=admin', '-e', 'LDAP_ADMIN_PASSWORD=adminpass',
    '-e', 'LDAP_USERS=user01', '-e', 'LDAP_PASSWORDS=pass01', '-e', `LDAP_ROOT=${ROOT}`,
    'bitnamilegacy/openldap:latest'])
  if (!await waitPort(PORT)) throw new Error('OpenLDAP did not open port')
  await sleep(3000) // let slapd finish seeding users

  const base = {
    address: '127.0.0.1', port: PORT, username: 'user01', currentCredential: 'pass01',
    logonCredential: 'adminpass',
    config: { url: `ldap://127.0.0.1:${PORT}`, allowInsecure: true, bindDn: 'cn=admin,' + ROOT, usersBaseDn: 'ou=users,' + ROOT, userIdAttr: 'cn' },
    log: () => {}
  }
  const newPass = 'LdapRotated_' + Math.random().toString(36).slice(2, 10)

  try {
    console.log('\n[ldap-it] === connector actions against real OpenLDAP ===')
    check('test (admin bind) succeeds', (await connector.test(base)).ok === true)
    check('verify with current credential succeeds', (await connector.verify(base)).ok === true)

    const changed = await connector.change({ ...base, newCredential: newPass })
    check('change reports ok + targetChanged + verified', changed.ok === true && changed.targetChanged === true && changed.verified === true)

    check('verify with NEW credential succeeds', (await connector.verify({ ...base, currentCredential: newPass })).ok === true)
    check('verify with OLD credential FAILS', (await connector.verify({ ...base, currentCredential: 'pass01' })).ok === false)

    const disc = await connector.discover(base)
    check('discover finds user01', disc.ok && disc.accounts.some((a) => a.username === 'user01'))

    check('LDAPS-by-default: plaintext ldap:// refused without allowInsecure',
      (await connector.test({ ...base, config: { ...base.config, allowInsecure: false } })).ok === false)
  } finally {
    sh('docker', ['rm', '-f', CID])
  }

  console.log(`\n[ldap-it] ${failures === 0 ? 'PASS' : 'FAIL'} — ${failures} failed assertion(s)`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => { console.error('[ldap-it] ERROR', e); sh('docker', ['rm', '-f', CID]); process.exit(1) })
