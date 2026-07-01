import { getDb, waitForDb, migrate } from '../utils/db'
import { nanoid } from 'nanoid'

export default defineNitroPlugin(async (nitroApp) => {
  // Only run this in development or if specifically requested, or as a one-time MVP seed
  nitroApp.hooks.hook('request', async () => {
    // We hook into the first request to ensure db is ready, but we only run once
  })
  
  // Actually, Nitro plugins run on startup. It's better to just run it on startup
  // but wait for DB.
  
  setTimeout(async () => {
    try {
      await waitForDb()
      await migrate()
      
      const db = getDb()
      
      // The Network module is populated from real devices (Network > Discovery,
      // or Add Device) and kept live by the real poller (server/plugins/netPoller.ts)
      // - no simulated devices/interfaces/sensors/flows/syslog are seeded. Default
      // probe and alert rules are seeded by the idempotent blocks further below.

      // The Server module (Zabbix clone) is populated from REAL hosts added via
      // Server > Hosts or Discovery and kept live by server/plugins/serverPoller.ts
      // (ICMP + SNMP). No fake hosts/problems/metrics are seeded. We only seed a
      // couple of example host groups and a default "Linux by SNMP" template
      // (items + triggers) so a freshly-added host can be provisioned in one click.
      await seedServerConfig(db)

      // Check if IPAM subnets exist
      const ipamRes = await db.query('SELECT count(*) as cnt FROM ipmgt_subnets')
      if (Number(ipamRes.rows[0].cnt) === 0) {
        console.log('[seed] Seeding MVP IPAM data...')
        
        const s1 = nanoid()
        const s2 = nanoid()
        
        await db.query(`INSERT INTO ipmgt_subnets (id, name, network, vlan, gateway, usage) VALUES
          ($1, 'Server Vlan', '10.0.1.0/24', 10, '10.0.1.254', 70),
          ($2, 'DB Vlan', '10.0.2.0/24', 20, '10.0.2.254', 17)`,
          [s1, s2]
        )
        
        await db.query(`INSERT INTO ipmgt_ips (id, subnet_id, ip, hostname, mac, description, state) VALUES
          ($1, $2, '10.0.1.1', 'N/A', '-', 'Reserved', 'Reserved'),
          ($3, $2, '10.0.1.10', 'web-front-01', '00:1A:2B:3C:4D:5E', 'Production Web Server', 'Used'),
          ($4, $2, '10.0.1.11', 'web-front-02', '00:1A:2B:3C:4D:5F', 'Production Web Server', 'Used')`,
          [nanoid(), s1, nanoid(), nanoid()]
        )
      }

      // --- Network Module: real-monitoring scaffolding (idempotent). ---

      // A single Local Probe representing this collector (this server). Newly
      // discovered devices are attached to it. Remote/distributed probes are a
      // real deployment concern, so none are fabricated here.
      const probeRes = await db.query('SELECT count(*) as cnt FROM net_probes')
      if (Number(probeRes.rows[0].cnt) === 0) {
        const now = new Date().toISOString()
        await db.query(`INSERT INTO net_probes (id, name, type, location, ip, version, status, last_seen, created_at) VALUES
          ($1, 'Local Probe', 'local', 'This server', '127.0.0.1', 'built-in', 'connected', $2, $2)`,
          [nanoid(), now]
        )
      }

      // Default alert rules (idempotent; harmless on an empty fleet).
      const ruleRes = await db.query('SELECT count(*) as cnt FROM net_alert_rules')
      if (Number(ruleRes.rows[0].cnt) === 0) {
        await db.query(`INSERT INTO net_alert_rules (id, name, metric, condition, threshold, severity) VALUES
          ($1, 'Device Down', 'status', '=', 'down', 'critical'),
          ($2, 'High CPU Load', 'cpu', '>', '90', 'critical'),
          ($3, 'High Temperature', 'temperature', '>', '70', 'warning'),
          ($4, 'Interface Saturation', 'traffic', '>', '90', 'warning')`,
          [nanoid(), nanoid(), nanoid(), nanoid()]
        )
      }

    } catch (err) {
      console.error('[seed] Failed to seed MVP data:', err)
    }
  }, 3000) // Wait 3 seconds to let db initialize
})

/**
 * Seed the Server (Zabbix) module's *configuration* only — example host groups
 * and a default "Linux by SNMP" template with real item OIDs + threshold
 * triggers. Idempotent (own count checks). No hosts or metric values are
 * fabricated; those come from the real poller.
 */
async function seedServerConfig(db: ReturnType<typeof getDb>) {
  const now = new Date().toISOString()

  const grpRes = await db.query('SELECT count(*) as cnt FROM server_host_groups')
  if (Number(grpRes.rows[0].cnt) === 0) {
    await db.query(
      `INSERT INTO server_host_groups (id, name, description, created_at) VALUES
        ($1, 'Linux servers', 'Linux hosts monitored by SNMP', $4),
        ($2, 'Windows servers', 'Windows hosts monitored by SNMP', $4),
        ($3, 'Network infrastructure', 'Switches, routers and appliances', $4)`,
      [nanoid(), nanoid(), nanoid(), now]
    )
  }

  const tplRes = await db.query('SELECT count(*) as cnt FROM server_templates')
  if (Number(tplRes.rows[0].cnt) === 0) {
    const tplId = nanoid()
    await db.query(
      `INSERT INTO server_templates (id, name, description, created_at) VALUES ($1, $2, $3, $4)`,
      [tplId, 'Linux by SNMP', 'CPU / memory / disk / uptime via SNMP, with default thresholds', now]
    )
    // Items: key_ drives collection in serverMonitor.ts (snmp_oid is informational).
    const items: [string, string, string, string, number][] = [
      // name, key_, units, snmp_oid (reference), update_interval
      ['CPU utilization',    'system.cpu.util',  '%',     '1.3.6.1.2.1.25.3.3.1.2', 60],
      ['Memory utilization', 'vm.memory.util',   '%',     '1.3.6.1.4.1.2021.4',      60],
      ['Root FS utilization','vfs.fs.size[/]',   '%',     '1.3.6.1.2.1.25.2.3.1',    60],
      ['System uptime',      'system.uptime',    'uptime','1.3.6.1.2.1.1.3.0',       60],
      ['CPU load (1m)',      'system.cpu.load',  '',      '1.3.6.1.4.1.2021.10.1.5.1', 60]
    ]
    for (const [name, key_, units, oid, interval] of items) {
      await db.query(
        `INSERT INTO server_template_items (id, template_id, name, key_, type, value_type, units, snmp_oid, update_interval)
         VALUES ($1, $2, $3, $4, 'snmp', 'numeric', $5, $6, $7)`,
        [nanoid(), tplId, name, key_, units, oid, interval]
      )
    }
    // Triggers: item_key, name, operator, threshold, for_seconds, severity(0-5).
    const triggers: [string, string, string, number, number, number][] = [
      ['system.cpu.util', 'High CPU utilization (>90% for 5m)',    '>', 90, 300, 3],
      ['vm.memory.util',  'High memory utilization (>90% for 5m)', '>', 90, 300, 3],
      ['vfs.fs.size[/]',  'Low free disk space on / (>90%)',       '>', 90, 0,   4]
    ]
    for (const [itemKey, name, op, threshold, forSec, sev] of triggers) {
      await db.query(
        `INSERT INTO server_template_triggers (id, template_id, name, item_key, operator, threshold, for_seconds, severity)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [nanoid(), tplId, name, itemKey, op, threshold, forSec, sev]
      )
    }
  }
}
