#!/usr/bin/env node
// Real proof of the MySQL/MariaDB connector (spec §4.5): change a DB account's
// password on a disposable MariaDB, then confirm the NEW credential connects
// and the OLD one is rejected. Fails loudly.
import net from 'node:net'
import { execFileSync } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import mysql from 'mysql2/promise'
import connector from '../../../services/pam/connector-runner/connectors/mysql/1.0.0/index.mjs'

const CID = 'pam-it-mysql'
const PORT = 53306
let failures = 0
const check = (n, c) => { if (c) console.log(`  ✓ ${n}`); else { console.error(`  ✗ ${n}`); failures++ } }
const sh = (c, a) => { try { return execFileSync(c, a, { encoding: 'utf8' }) } catch (e) { return e.stdout || '' } }

async function waitReady(ms = 60000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try { const c = await mysql.createConnection({ host: '127.0.0.1', port: PORT, user: 'root', password: 'rootpass', connectTimeout: 3000 }); await c.query('SELECT 1'); await c.end(); return true } catch { /* not ready */ }
    await sleep(1500)
  }
  return false
}
async function canConnect(user, password) {
  try { const c = await mysql.createConnection({ host: '127.0.0.1', port: PORT, user, password, connectTimeout: 5000 }); await c.query('SELECT 1'); await c.end(); return true } catch { return false }
}

async function main() {
  sh('docker', ['rm', '-f', CID])
  console.log('[mysql-it] starting disposable MariaDB…')
  sh('docker', ['run', '-d', '--name', CID, '-p', `${PORT}:3306`,
    '-e', 'MARIADB_ROOT_PASSWORD=rootpass', '-e', 'MARIADB_DATABASE=appdb',
    '-e', 'MARIADB_USER=appuser', '-e', 'MARIADB_PASSWORD=InitialPass123', 'mariadb:11'])
  if (!await waitReady()) throw new Error('MariaDB did not become ready')

  const base = {
    address: '127.0.0.1', port: PORT, username: 'appuser', currentCredential: 'InitialPass123',
    logonCredential: 'rootpass', config: { logonUsername: 'root', userHost: '%', database: 'appdb' }, log: () => {}
  }
  const newPass = 'MyRotated_' + Math.random().toString(36).slice(2, 10)

  try {
    console.log('\n[mysql-it] === connector actions against real MariaDB ===')
    check('test (root) connection ok', (await connector.test(base)).ok === true)
    check('verify with current credential ok', (await connector.verify(base)).ok === true)

    const changed = await connector.change({ ...base, newCredential: newPass })
    check('change reports ok + targetChanged + verified', changed.ok && changed.targetChanged && changed.verified)

    check('NEW password connects', await canConnect('appuser', newPass))
    check('OLD password REJECTED', !(await canConnect('appuser', 'InitialPass123')))

    const disc = await connector.discover(base)
    check('discover finds appuser + root', disc.ok && disc.accounts.some((a) => a.username === 'appuser') && disc.accounts.some((a) => a.username === 'root'))
  } finally {
    sh('docker', ['rm', '-f', CID])
  }

  console.log(`\n[mysql-it] ${failures === 0 ? 'PASS' : 'FAIL'} — ${failures} failed assertion(s)`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => { console.error('[mysql-it] ERROR', e); sh('docker', ['rm', '-f', CID]); process.exit(1) })
