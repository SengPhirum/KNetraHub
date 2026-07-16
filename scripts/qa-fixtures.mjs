import process from 'node:process'
import pg from 'pg'
import bcrypt from 'bcryptjs'

const { Pool } = pg
const mode = process.argv[2]
if (!['init', 'clean'].includes(mode)) {
  console.error('Usage: node scripts/qa-fixtures.mjs init|clean')
  process.exit(2)
}

const pool = new Pool({
  host: process.env.QA_DB_HOST || process.env.NUXT_DB_HOST || 'localhost',
  port: Number(process.env.QA_DB_PORT || process.env.NUXT_DB_PORT || 5432),
  database: process.env.QA_DB_NAME || process.env.NUXT_DB_NAME || 'knetrahub',
  user: process.env.QA_DB_USER || process.env.NUXT_DB_USER || 'knetrahub',
  password: process.env.QA_DB_PASSWORD || process.env.NUXT_DB_PASSWORD || 'knetrahub',
  ssl: (process.env.QA_DB_SSL || process.env.NUXT_DB_SSL) === 'true'
    ? { rejectUnauthorized: false }
    : false
})

const ids = {
  user: 'qa-local-admin',
  audit: 'qa-audit-login', stack: 'qa-stack-history', alertEvent: 'qa-alert-event',
  section: 'qa-ipam-section', l2: 'qa-ipam-l2', vlan: 'qa-ipam-vlan', vrf: 'qa-ipam-vrf',
  subnet: 'qa-ipam-subnet', ipGateway: 'qa-ipam-ip-gateway', ipServer: 'qa-ipam-ip-server', history: 'qa-ipam-history'
}

async function clean(client) {
  // Child rows without FK cascades first; every predicate is restricted to
  // deterministic qa-* IDs so real/local user data is never selected.
  // Monitoring fixtures live in layers/monitoring/tests/fixtures and are
  // managed by that layer's own test harness, never seeded here.
  const deletes = [
    ['ipmgt_ip_history', [ids.history]], ['ipmgt_ips', [ids.ipGateway, ids.ipServer]],
    ['ipmgt_subnets', [ids.subnet]], ['ipmgt_vlans', [ids.vlan]], ['ipmgt_vrfs', [ids.vrf]],
    ['ipmgt_l2domains', [ids.l2]], ['ipmgt_sections', [ids.section]],
    ['alert_events', [ids.alertEvent]], ['stack_history', [ids.stack]], ['audit', [ids.audit]],
    ['users', [ids.user]]
  ]
  for (const [table, rowIds] of deletes) {
    await client.query(`DELETE FROM ${table} WHERE id = ANY($1::text[])`, [rowIds])
  }
}

async function init(client) {
  const now = new Date().toISOString()
  await clean(client)

  const fixturePassword = process.env.QA_FIXTURE_PASSWORD || 'qa-local-only'
  const passwordHash = await bcrypt.hash(fixturePassword, 10)
  await client.query(
    `INSERT INTO users (id,username,display_name,email,role,source,password_hash,created_at,app_access)
     VALUES ($1,'qa-admin','Smart QA Admin','qa-admin@localhost.invalid','admin','local',$2,$3,$4)`,
    [ids.user, passwordHash, now, JSON.stringify({ docker: 'admin', monitoring: 'admin', ipmgt: 'admin' })]
  )

  // Portal and Docker module fixtures. Docker's live resources still come from
  // the local Swarm; these rows exercise its persisted history and alerts.
  await client.query(`INSERT INTO audit (id, ts, actor, action, target, detail) VALUES ($1,$2,'qa-runner','qa.fixture.init','all-modules','Smart QA fixture set')`, [ids.audit, now])
  await client.query(`INSERT INTO stack_history (id, stack_name, compose, message, author, source, created_at) VALUES ($1,'qa-demo-stack',$2,'Smart QA demo deployment','qa-runner','local',$3)`, [ids.stack, "services:\n  web:\n    image: nginx:alpine\n", now])
  await client.query(`INSERT INTO alert_events (id, rule_type, target, severity, message, fired_at) VALUES ($1,'qa-check','qa-demo-stack','info','Smart QA sample alert',$2)`, [ids.alertEvent, now])

  // Monitoring fixtures intentionally omitted: the Monitoring module only
  // holds real collected data; its tests use layers/monitoring/tests/fixtures.

  // IP Management.
  await client.query(`INSERT INTO ipmgt_sections (id,name,description,display_order,active,created_at,created_by) VALUES ($1,'QA Lab','Smart QA IPAM fixtures',900,true,$2,'qa-runner')`, [ids.section, now])
  await client.query(`INSERT INTO ipmgt_l2domains (id,name,description,location,active,created_at) VALUES ($1,'QA Domain','Smart QA L2 domain','QA Lab',true,$2)`, [ids.l2, now])
  await client.query(`INSERT INTO ipmgt_vlans (id,vlan_id,name,description,l2domain_id,location,active,created_at) VALUES ($1,4090,'QA VLAN','Smart QA isolated VLAN',$2,'QA Lab',true,$3)`, [ids.vlan, ids.l2, now])
  await client.query(`INSERT INTO ipmgt_vrfs (id,name,rd,description,owner,location,active,created_at) VALUES ($1,'QA-VRF','65000:4090','Smart QA isolated routing table','qa-runner','QA Lab',true,$2)`, [ids.vrf, now])
  await client.query(`INSERT INTO ipmgt_subnets (id,name,network,vlan,gateway,usage,description,section_id,vlan_ref,vrf_id,version,prefix,netmask,location,owner,created_at,created_by) VALUES ($1,'QA Application Network','192.0.2.0/28',4090,'192.0.2.1',13,'Smart QA documentation network',$2,$3,$4,4,28,'255.255.255.240','QA Lab','qa-runner',$5,'qa-runner')`, [ids.subnet, ids.section, ids.vlan, ids.vrf, now])
  await client.query(`INSERT INTO ipmgt_ips (id,subnet_id,ip,hostname,mac,description,state,status,owner,device,created_at,created_by) VALUES ($1,$3,'192.0.2.1','qa-gateway','02:00:00:00:10:01','QA gateway','gateway','gateway','qa-runner','qa-router',$4,'qa-runner'),($2,$3,'192.0.2.10','qa-app-server','02:00:00:00:10:0a','QA application server','used','used','qa-runner','qa-app-server',$4,'qa-runner')`, [ids.ipGateway, ids.ipServer, ids.subnet, now])
  await client.query(`INSERT INTO ipmgt_ip_history (id,ip_id,subnet_id,ip,action,actor,detail,changed_at) VALUES ($1,$2,$3,'192.0.2.10','created','qa-runner','Smart QA fixture initialized',$4)`, [ids.history, ids.ipServer, ids.subnet, now])
}

const client = await pool.connect()
try {
  await client.query('BEGIN')
  if (mode === 'init') await init(client)
  else await clean(client)
  await client.query('COMMIT')
  console.log(`[qa-fixtures] ${mode === 'init' ? 'Initialized' : 'Removed'} isolated fixtures for portal, Docker history, and IP Management.`)
} catch (error) {
  await client.query('ROLLBACK')
  console.error(`[qa-fixtures] ${mode} failed:`, error.message)
  process.exitCode = 1
} finally {
  client.release()
  await pool.end()
}
