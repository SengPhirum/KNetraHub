#!/usr/bin/env node
// Real proof of the MongoDB connector (spec §4.5): change a DB account's
// password on a disposable MongoDB, then confirm the NEW credential connects
// and the OLD one is rejected. Fails loudly.
import { execFileSync } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { MongoClient } from 'mongodb'
import connector from '../../../services/pam/connector-runner/connectors/mongodb/1.0.0/index.mjs'

const CID = 'pam-it-mongo'
const PORT = 57017
const ADMIN = { username: 'root', password: 'rootpass' }
let failures = 0
const check = (n, c) => { if (c) console.log(`  ✓ ${n}`); else { console.error(`  ✗ ${n}`); failures++ } }
const sh = (c, a) => { try { return execFileSync(c, a, { encoding: 'utf8' }) } catch (e) { return e.stdout || '' } }

async function adminClient() { const c = new MongoClient(`mongodb://127.0.0.1:${PORT}`, { auth: ADMIN, authSource: 'admin', serverSelectionTimeoutMS: 3000 }); await c.connect(); return c }
async function waitReady(ms = 60000) {
  const end = Date.now() + ms
  while (Date.now() < end) { try { const c = await adminClient(); await c.db('admin').command({ ping: 1 }); await c.close(); return true } catch { await sleep(1500) } }
  return false
}
async function canConnect(username, password, db) {
  try { const c = new MongoClient(`mongodb://127.0.0.1:${PORT}`, { auth: { username, password }, authSource: db, serverSelectionTimeoutMS: 5000 }); await c.connect(); await c.db(db).command({ ping: 1 }); await c.close(); return true } catch { return false }
}

async function main() {
  sh('docker', ['rm', '-f', CID])
  console.log('[mongo-it] starting disposable MongoDB…')
  sh('docker', ['run', '-d', '--name', CID, '-p', `${PORT}:27017`,
    '-e', 'MONGO_INITDB_ROOT_USERNAME=root', '-e', 'MONGO_INITDB_ROOT_PASSWORD=rootpass', 'mongo:7'])
  if (!await waitReady()) throw new Error('MongoDB did not become ready')

  // Seed a target user in appdb.
  const admin = await adminClient()
  await admin.db('appdb').command({ createUser: 'appuser', pwd: 'InitialPass123', roles: [{ role: 'readWrite', db: 'appdb' }] })
  await admin.close()

  const base = {
    address: '127.0.0.1', port: PORT, username: 'appuser', currentCredential: 'InitialPass123',
    logonCredential: 'rootpass', config: { logonUsername: 'root', logonAuthSource: 'admin', authSource: 'appdb' }, log: () => {}
  }
  const newPass = 'MongoRotated_' + Math.random().toString(36).slice(2, 10)

  try {
    console.log('\n[mongo-it] === connector actions against real MongoDB ===')
    check('test (root) connection ok', (await connector.test(base)).ok === true)
    check('verify with current credential ok', (await connector.verify(base)).ok === true)

    const changed = await connector.change({ ...base, newCredential: newPass })
    check('change reports ok + targetChanged + verified', changed.ok && changed.targetChanged && changed.verified)

    check('NEW password connects', await canConnect('appuser', newPass, 'appdb'))
    check('OLD password REJECTED', !(await canConnect('appuser', 'InitialPass123', 'appdb')))

    const disc = await connector.discover(base)
    check('discover finds appuser', disc.ok && disc.accounts.some((a) => a.username === 'appuser'))
  } finally {
    sh('docker', ['rm', '-f', CID])
  }

  console.log(`\n[mongo-it] ${failures === 0 ? 'PASS' : 'FAIL'} — ${failures} failed assertion(s)`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => { console.error('[mongo-it] ERROR', e); sh('docker', ['rm', '-f', CID]); process.exit(1) })
