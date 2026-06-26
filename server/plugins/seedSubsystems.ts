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

      // Check if server hosts exist
      const srvRes = await db.query('SELECT count(*) as cnt FROM server_hosts')
      if (Number(srvRes.rows[0].cnt) === 0) {
        console.log('[seed] Seeding MVP Server data...')
        
        const h1 = nanoid()
        const h2 = nanoid()
        const h3 = nanoid()
        const h4 = nanoid()
        
        await db.query(`INSERT INTO server_hosts (id, name, ip, os, status, cpu, memory, uptime, agent) VALUES
          ($1, 'web-front-01', '10.0.1.10', 'Ubuntu 22.04', 'Available', '45%', '62%', '124 days', 'Zabbix agent 6.4'),
          ($2, 'web-front-02', '10.0.1.11', 'Ubuntu 22.04', 'Available', '50%', '65%', '124 days', 'Zabbix agent 6.4'),
          ($3, 'db-prod-01', '10.0.2.10', 'RHEL 9', 'Available', '15%', '90%', '124 days', 'Zabbix agent 6.4'),
          ($4, 'win-util-01', '10.0.3.5', 'Windows Server 2022', 'Offline', '-', '-', '0 days', 'Zabbix agent 6.4')`,
          [h1, h2, h3, h4]
        )
        
        await db.query(`INSERT INTO server_problems (id, host_id, trigger, severity, fired_at, duration, ack) VALUES
          ($1, $2, 'Free disk space is less than 10% on volume /var/lib/postgresql', 'High', $5, '15m', false),
          ($3, $4, 'CPU load is too high (over 90% for 5m)', 'Average', $5, '1h', true)`,
          [nanoid(), h3, nanoid(), h2, new Date().toISOString()]
        )
      }
      
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
