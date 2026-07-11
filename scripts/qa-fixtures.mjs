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
  probe: 'qa-net-probe', device: 'qa-net-device', iface1: 'qa-net-iface-1', iface2: 'qa-net-iface-2',
  sensor: 'qa-net-sensor', netRule: 'qa-net-rule', netAlert: 'qa-net-alert', netGroup: 'qa-net-group',
  dashboard: 'qa-net-dashboard',
  host: 'qa-server-host', hostIface: 'qa-server-interface', hostGroup: 'qa-server-group',
  itemCpu: 'qa-server-item-cpu', itemMemory: 'qa-server-item-memory', trigger: 'qa-server-trigger',
  problem: 'qa-server-problem', service: 'qa-server-service', web: 'qa-server-web', webStep: 'qa-server-web-step',
  section: 'qa-ipam-section', l2: 'qa-ipam-l2', vlan: 'qa-ipam-vlan', vrf: 'qa-ipam-vrf',
  subnet: 'qa-ipam-subnet', ipGateway: 'qa-ipam-ip-gateway', ipServer: 'qa-ipam-ip-server', history: 'qa-ipam-history'
}

async function clean(client) {
  // Child rows without FK cascades first; every predicate is restricted to
  // deterministic qa-* IDs so real/local user data is never selected.
  const deletes = [
    ['ipmgt_ip_history', [ids.history]], ['ipmgt_ips', [ids.ipGateway, ids.ipServer]],
    ['ipmgt_subnets', [ids.subnet]], ['ipmgt_vlans', [ids.vlan]], ['ipmgt_vrfs', [ids.vrf]],
    ['ipmgt_l2domains', [ids.l2]], ['ipmgt_sections', [ids.section]],
    ['server_web_steps', [ids.webStep]], ['server_web_scenarios', [ids.web]],
    ['server_services', [ids.service]], ['server_problems', [ids.problem]],
    ['server_triggers', [ids.trigger]], ['server_items', [ids.itemCpu, ids.itemMemory]],
    ['server_host_group_members', [], 'host_id'], ['server_host_interfaces', [ids.hostIface]],
    ['server_hosts', [ids.host]], ['server_host_groups', [ids.hostGroup]],
    ['net_dashboards', [ids.dashboard]], ['net_device_groups', [], 'device_id'], ['net_alerts', [ids.netAlert]],
    ['net_alert_rules', [ids.netRule]], ['net_sensors', [ids.sensor]],
    ['net_interfaces', [ids.iface1, ids.iface2]], ['net_devices', [ids.device]],
    ['net_groups', [ids.netGroup]], ['net_probes', [ids.probe]],
    ['alert_events', [ids.alertEvent]], ['stack_history', [ids.stack]], ['audit', [ids.audit]],
    ['users', [ids.user]]
  ]
  for (const [table, rowIds, key = 'id'] of deletes) {
    const values = rowIds.length ? rowIds : [key === 'host_id' ? ids.host : ids.device]
    await client.query(`DELETE FROM ${table} WHERE ${key} = ANY($1::text[])`, [values])
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

  // Monitoring / Network.
  await client.query(`INSERT INTO net_probes (id,name,type,location,ip,version,status,last_seen,created_at) VALUES ($1,'QA Local Probe','local','QA Lab','192.0.2.1','1.0','connected',$2,$2)`, [ids.probe, now])
  await client.query(`INSERT INTO net_devices (id,hostname,ip,type,vendor,os,status,uptime,snmp_version,poll_method,category,sys_name,sys_descr,created_at,probe_id,last_polled,last_rtt_ms,monitoring_enabled) VALUES ($1,'qa-core-switch','192.0.2.10','switch','KNetra Labs','QA Network OS','up','7 days','v2c','snmp','network','qa-core-switch','Smart QA virtual core switch',$2,$3,$2,2.4,false)`, [ids.device, now, ids.probe])
  await client.query(`INSERT INTO net_interfaces (id,device_id,name,status,speed,in_traffic,out_traffic,mac_address,mtu,admin_status,oper_status,type,if_index) VALUES ($1,$3,'Gi0/1','up','1 Gbps','42 Mbps','18 Mbps','02:00:00:00:00:01','1500','up','up','ethernet',1),($2,$3,'Gi0/2','down','1 Gbps','0 Mbps','0 Mbps','02:00:00:00:00:02','1500','down','down','ethernet',2)`, [ids.iface1, ids.iface2, ids.device])
  await client.query(`INSERT INTO net_sensors (id,device_id,sensor_type,name,current_value,unit,limit_high,limit_low) VALUES ($1,$2,'temperature','QA Chassis Temperature',38.5,'C',75,5)`, [ids.sensor, ids.device])
  await client.query(`INSERT INTO net_alert_rules (id,name,metric,condition,threshold,severity,enabled) VALUES ($1,'QA packet loss','packet_loss','>','5','warning',true)`, [ids.netRule])
  await client.query(`INSERT INTO net_alerts (id,device_id,rule_id,message,severity,status,timestamp) VALUES ($1,$2,$3,'QA interface Gi0/2 is down','warning','active',$4)`, [ids.netAlert, ids.device, ids.netRule, now])
  await client.query(`INSERT INTO net_groups (id,name,description,created_at) VALUES ($1,'QA Lab','Smart QA network fixtures',$2)`, [ids.netGroup, now])
  await client.query(`INSERT INTO net_device_groups (device_id,group_id) VALUES ($1,$2)`, [ids.device, ids.netGroup])
  const dashboardLayout = [
    { i: 'qa-status', x: 0, y: 0, w: 12, h: 2, type: 'status-summary' },
    { i: 'qa-hosts', x: 0, y: 2, w: 12, h: 2, type: 'host-status-summary' },
    { i: 'qa-devices', x: 0, y: 4, w: 7, h: 4, type: 'device-grid' },
    { i: 'qa-problems', x: 7, y: 4, w: 5, h: 4, type: 'top-problems' }
  ]
  await client.query(`INSERT INTO net_dashboards (id,owner,name,layout,is_default,created_at,updated_at) VALUES ($1,$2,'QA Operations Overview',$3,true,$4,$4)`, [ids.dashboard, ids.user, JSON.stringify(dashboardLayout), now])

  // Monitoring / Server.
  await client.query(`INSERT INTO server_host_groups (id,name,description,created_at) VALUES ($1,'QA Servers','Smart QA server fixtures',$2)`, [ids.hostGroup, now])
  await client.query(`INSERT INTO server_hosts (id,name,ip,os,status,cpu,memory,uptime,agent,description,poll_method,availability,monitoring_enabled,last_polled,last_rtt_ms,created_at) VALUES ($1,'qa-app-server','192.0.2.20','Ubuntu 24.04','Available','24%','58%','7 days','QA agent','Smart QA virtual application server','icmp','available',false,$2,1.8,$2)`, [ids.host, now])
  await client.query(`INSERT INTO server_host_interfaces (id,host_id,type,ip,port,main) VALUES ($1,$2,'agent','192.0.2.20',10050,true)`, [ids.hostIface, ids.host])
  await client.query(`INSERT INTO server_host_group_members (host_id,group_id) VALUES ($1,$2)`, [ids.host, ids.hostGroup])
  await client.query(`INSERT INTO server_items (id,host_id,name,key_,type,value_type,units,update_interval,status,last_value,last_clock,created_at) VALUES ($1,$3,'CPU utilization','system.cpu.util','agent','numeric','%',60,'enabled',24.2,$4,$4),($2,$3,'Memory utilization','vm.memory.util','agent','numeric','%',60,'enabled',58.4,$4,$4)`, [ids.itemCpu, ids.itemMemory, ids.host, now])
  await client.query(`INSERT INTO server_triggers (id,host_id,item_id,name,operator,threshold,for_seconds,severity,status,last_state,created_at) VALUES ($1,$2,$3,'QA CPU utilization high','>',80,300,3,'enabled','problem',$4)`, [ids.trigger, ids.host, ids.itemCpu, now])
  await client.query(`INSERT INTO server_problems (id,host_id,trigger,severity,fired_at,duration,ack,trigger_id,name,severity_num,status,suppressed) VALUES ($1,$2,'QA CPU utilization high','Average',$3,'5m',false,$4,'QA CPU utilization high',3,'problem',false)`, [ids.problem, ids.host, now, ids.trigger])
  await client.query(`INSERT INTO server_services (id,name,algorithm,sla_target,trigger_id,created_at) VALUES ($1,'QA Customer Portal','worst',99.9,$2,$3)`, [ids.service, ids.trigger, now])
  await client.query(`INSERT INTO server_web_scenarios (id,host_id,name,url,expected_status,interval,status,last_status,last_code,last_ms,last_check,created_at) VALUES ($1,$2,'QA Health Page','https://example.invalid/health',200,60,'enabled','up',200,42,$3,$3)`, [ids.web, ids.host, now])
  await client.query(`INSERT INTO server_web_steps (id,scenario_id,step_no,name,url,expected_status,last_status,last_code,last_ms,last_check) VALUES ($1,$2,1,'Open health page','https://example.invalid/health',200,'up',200,42,$3)`, [ids.webStep, ids.web, now])

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
  console.log(`[qa-fixtures] ${mode === 'init' ? 'Initialized' : 'Removed'} isolated fixtures for portal, Docker history, Monitoring, and IP Management.`)
} catch (error) {
  await client.query('ROLLBACK')
  console.error(`[qa-fixtures] ${mode} failed:`, error.message)
  process.exitCode = 1
} finally {
  client.release()
  await pool.end()
}
