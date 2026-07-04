import { getDb, waitForDb, migrate } from '../utils/db'
import { nanoid } from 'nanoid'
import { cidrInfo, isValidCidr } from '../utils/ipam'

export default defineNitroPlugin(async (nitroApp) => {
  if (useRuntimeConfig().public.staticDocs) return

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

      // IPAM module: backfill derived columns on any legacy rows, then seed a
      // realistic demo dataset (sections, VRFs, VLANs, subnets, addresses) the
      // first time — all idempotent.
      await seedIpamData(db)

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

  // Each template + its items/triggers are seeded idempotently *per row* (not
  // just gated on "does the template exist") so new default sensors added
  // later also land on installs that already seeded an earlier version.
  const linuxTplId = await ensureTemplate(db, now,
    'Linux by SNMP',
    'CPU / memory / swap / disk / load / network / process metrics via SNMP (Linux + Windows), with default thresholds'
  )
  // Items: key_ drives collection in serverMonitor.ts/serverPoller.ts (snmp_oid
  // is informational for keys resolved specially — counters, the derived
  // free-space/bandwidth-% items, and the sysDescr text item all ignore it).
  await seedTemplateItems(db, linuxTplId, [
    // name, key_, units, snmp_oid (reference), update_interval, value_type
    ['CPU utilization',         'system.cpu.util',       '%',      '1.3.6.1.2.1.25.3.3.1.2',    60],
    ['Memory utilization',      'vm.memory.util',        '%',      '1.3.6.1.2.1.25.2.3.1',      60],
    ['Swap utilization',        'system.swap.util',      '%',      '1.3.6.1.4.1.2021.4.3.0',    60],
    ['Root FS utilization',     'vfs.fs.size[/]',        '%',      '1.3.6.1.2.1.25.2.3.1',      60],
    ['Root FS free space',      'vfs.fs.size[/,pfree]',  '%',      '',                          60],
    ['System description',     'system.descr',           '',      '1.3.6.1.2.1.1.1.0',         300, 'text'],
    ['System uptime',           'system.uptime',         'uptime', '1.3.6.1.2.1.1.3.0',         60],
    ['Load average (1m)',       'system.cpu.load',       '',       '1.3.6.1.4.1.2021.10.1.3.1', 60],
    ['Load average (5m)',       'system.cpu.load5',      '',       '1.3.6.1.4.1.2021.10.1.3.2', 60],
    ['Load average (15m)',      'system.cpu.load15',     '',       '1.3.6.1.4.1.2021.10.1.3.3', 60],
    ['Number of processes',     'proc.num',              '',       '1.3.6.1.2.1.25.1.6.0',      60],
    ['Interface status',        'net.if.status',         '',       '1.3.6.1.2.1.2.2.1.8',       60],
    ['Interface uptime',        'net.if.uptime',         'uptime', '1.3.6.1.2.1.2.2.1.9',       60],
    ['Interface in traffic',    'net.if.in',              'bps',   '1.3.6.1.2.1.2.2.1.10',      60],
    ['Interface out traffic',   'net.if.out',             'bps',   '1.3.6.1.2.1.2.2.1.16',      60],
    ['Interface in packets',    'net.if.in.packets',      'pps',   '1.3.6.1.2.1.2.2.1.11',      60],
    ['Interface out packets',   'net.if.out.packets',     'pps',   '1.3.6.1.2.1.2.2.1.17',      60],
    ['Interface errors',        'net.if.errors',          '/s',    '',                          60],
    ['Interface discards',      'net.if.discards',        '/s',    '',                          60],
    ['Interface bandwidth usage', 'net.if.bandwidth.pct', '%',     '',                          60]
  ])
  // Triggers: item_key, name, operator, threshold, for_seconds, severity(0-5).
  await seedTemplateTriggers(db, linuxTplId, [
    ['system.cpu.util',  'High CPU utilization (>90% for 5m)',    '>', 90, 300, 3],
    ['vm.memory.util',   'High memory utilization (>90% for 5m)', '>', 90, 300, 3],
    ['vfs.fs.size[/]',   'Low free disk space on / (>90%)',       '>', 90, 0,   4],
    ['net.if.status',    'Interface down',                        '<', 1,  60,  4]
  ])

  // A second, optional template for gear that exposes UPS-MIB (RFC 1628,
  // networked UPS units) and/or ENTITY-SENSOR-MIB (RFC 3433, temperature/fan —
  // mostly chassis/network hardware). Deliberately NOT part of "Linux by SNMP":
  // most Linux/Windows hosts don't expose either MIB, so bundling them in would
  // just show "no data" on almost every host. Link this only to devices that
  // actually have it (a UPS, or switches/appliances with hardware sensors).
  // Vendor-specific hardware (RAID controllers, PSU/physical-disk status,
  // Windows services) has no universal standard OID, so it isn't seeded here —
  // add those per-device via a custom-OID item instead.
  const hwTplId = await ensureTemplate(db, now,
    'UPS & Hardware Sensors (SNMP)',
    'Battery/UPS (UPS-MIB) and temperature/fan (ENTITY-SENSOR-MIB) for gear that exposes them — link only to devices that actually have these sensors'
  )
  await seedTemplateItems(db, hwTplId, [
    ['UPS battery status',            'ups.battery.status',  '',    '1.3.6.1.2.1.33.1.2.1', 60],
    ['UPS battery charge remaining',  'ups.battery.charge',  '%',   '1.3.6.1.2.1.33.1.2.4', 60],
    ['UPS battery runtime remaining', 'ups.battery.runtime', 'min', '1.3.6.1.2.1.33.1.2.3', 60],
    ['UPS output source',             'ups.output.source',   '',    '1.3.6.1.2.1.33.1.4.1', 60],
    ['Temperature',                   'sensor.temperature',  '°C',  '',                     60],
    ['Fan speed',                     'sensor.fan',          'rpm', '',                     60]
  ])
  await seedTemplateTriggers(db, hwTplId, [
    // battery status 3=low, 4=depleted (UPS-MIB BatteryStatus enum)
    ['ups.battery.status', 'UPS battery low or depleted', '>=', 3, 0,  5],
    // output source 5=battery (UPS-MIB OutputSource enum) — running on battery
    ['ups.output.source',  'UPS running on battery power', '=', 5, 0,  3],
    ['sensor.temperature', 'High temperature (>35°C)',      '>', 35, 60, 3]
  ])
}

async function ensureTemplate(db: ReturnType<typeof getDb>, now: string, name: string, description: string): Promise<string> {
  const found = await db.query('SELECT id FROM server_templates WHERE name = $1 LIMIT 1', [name])
  if (found.rows.length) return found.rows[0].id
  const id = nanoid()
  await db.query(
    `INSERT INTO server_templates (id, name, description, created_at) VALUES ($1, $2, $3, $4)`,
    [id, name, description, now]
  )
  return id
}

type SeedItem = [name: string, key_: string, units: string, oid: string, interval: number, valueType?: string]

async function seedTemplateItems(db: ReturnType<typeof getDb>, tplId: string, items: SeedItem[]) {
  for (const [name, key_, units, oid, interval, valueType] of items) {
    const exists = await db.query('SELECT 1 FROM server_template_items WHERE template_id = $1 AND key_ = $2', [tplId, key_])
    if (exists.rows.length) continue
    await db.query(
      `INSERT INTO server_template_items (id, template_id, name, key_, type, value_type, units, snmp_oid, update_interval)
       VALUES ($1, $2, $3, $4, 'snmp', $5, $6, $7, $8)`,
      [nanoid(), tplId, name, key_, valueType || 'numeric', units, oid, interval]
    )
  }
}

type SeedTrigger = [itemKey: string, name: string, op: string, threshold: number, forSec: number, severity: number]

async function seedTemplateTriggers(db: ReturnType<typeof getDb>, tplId: string, triggers: SeedTrigger[]) {
  for (const [itemKey, name, op, threshold, forSec, sev] of triggers) {
    const exists = await db.query('SELECT 1 FROM server_template_triggers WHERE template_id = $1 AND item_key = $2', [tplId, itemKey])
    if (exists.rows.length) continue
    await db.query(
      `INSERT INTO server_template_triggers (id, template_id, name, item_key, operator, threshold, for_seconds, severity)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [nanoid(), tplId, name, itemKey, op, threshold, forSec, sev]
    )
  }
}

/**
 * Seed the IPAM (IP Management) module. Two independent, idempotent steps:
 *  1. Backfill version/prefix/netmask on any subnet rows that predate the full
 *     schema, and mirror `state` → `status` on legacy addresses.
 *  2. On a fresh install (no sections yet), create a realistic demo dataset:
 *     sections, a VLAN domain + VLANs, VRFs, subnets (IPv4 + IPv6) and a handful
 *     of example addresses with mixed statuses.
 */
async function seedIpamData(db: ReturnType<typeof getDb>) {
  const now = new Date().toISOString()

  // (1) Backfill derived subnet columns.
  const legacy = await db.query('SELECT id, network FROM ipmgt_subnets WHERE prefix IS NULL')
  for (const row of legacy.rows) {
    if (!isValidCidr(row.network)) continue
    const info = cidrInfo(row.network)
    await db.query(
      'UPDATE ipmgt_subnets SET version = $2, prefix = $3, netmask = $4, network = $5, created_at = COALESCE(created_at, $6) WHERE id = $1',
      [row.id, info.version, info.prefix, info.netmask, `${info.network}/${info.prefix}`, now]
    )
  }
  // Mirror legacy `state` → canonical `status`.
  await db.query(`UPDATE ipmgt_ips SET status = lower(state) WHERE status IS NULL AND state IS NOT NULL`)
  await db.query(`UPDATE ipmgt_ips SET status = 'used' WHERE status IS NULL`)

  // (2) Fresh-install demo dataset (skip if any sections already exist).
  const secCount = await db.query('SELECT count(*)::int AS c FROM ipmgt_sections')
  if (Number(secCount.rows[0].c) > 0) return
  console.log('[seed] Seeding IPAM demo data (sections, VLANs, VRFs, subnets, addresses)...')

  const sections: Record<string, string> = {}
  const secDefs: [string, string, number][] = [
    ['Head Office', 'Corporate head office networks', 1],
    ['Branches', 'Branch office networks', 2],
    ['Data Center', 'Primary data center networks', 3],
    ['Cloud', 'Public/private cloud networks', 4],
    ['DR Site', 'Disaster recovery site networks', 5]
  ]
  for (const [name, desc, order] of secDefs) {
    const id = nanoid()
    sections[name] = id
    await db.query(
      `INSERT INTO ipmgt_sections (id, name, description, display_order, active, created_at, created_by)
       VALUES ($1,$2,$3,$4,true,$5,'seed')`,
      [id, name, desc, order, now]
    )
  }

  const l2 = nanoid()
  await db.query(
    `INSERT INTO ipmgt_l2domains (id, name, description, active, created_at) VALUES ($1,'Default','Default L2 / VLAN domain',true,$2)`,
    [l2, now]
  )

  const vlans: Record<number, string> = {}
  const vlanDefs: [number, string, string][] = [
    [10, 'Servers', 'Server VLAN'],
    [20, 'Database', 'Database VLAN'],
    [30, 'Workstations', 'User workstation VLAN'],
    [40, 'DMZ', 'DMZ / public-facing VLAN'],
    [100, 'Management', 'Out-of-band management VLAN']
  ]
  for (const [vid, name, desc] of vlanDefs) {
    const id = nanoid()
    vlans[vid] = id
    await db.query(
      `INSERT INTO ipmgt_vlans (id, vlan_id, name, description, l2domain_id, active, created_at) VALUES ($1,$2,$3,$4,$5,true,$6)`,
      [id, vid, name, desc, l2, now]
    )
  }

  const vrfs: Record<string, string> = {}
  for (const [name, rd, desc] of [['global', '', 'Default global routing table'], ['customer-a', '65000:100', 'Customer A isolated VRF']] as [string, string, string][]) {
    const id = nanoid()
    vrfs[name] = id
    await db.query(
      `INSERT INTO ipmgt_vrfs (id, name, rd, description, active, created_at) VALUES ($1,$2,$3,$4,true,$5)`,
      [id, name, rd || null, desc, now]
    )
  }

  // subnet: [name, cidr, vlanId|null, sectionName, gateway|null, vrfName|null]
  const subnetDefs: [string, string, number | null, string, string | null, string | null][] = [
    ['Server farm', '10.0.1.0/24', 10, 'Data Center', '10.0.1.254', 'global'],
    ['Database tier', '10.0.2.0/24', 20, 'Data Center', '10.0.2.254', 'global'],
    ['Management', '10.0.10.0/24', 100, 'Data Center', '10.0.10.254', 'global'],
    ['HO workstations', '192.168.1.0/24', 30, 'Head Office', '192.168.1.1', 'global'],
    ['DMZ', '203.0.113.0/28', 40, 'Data Center', '203.0.113.1', 'global'],
    ['IPv6 servers', '2001:db8:1::/64', 10, 'Data Center', '2001:db8:1::1', 'global']
  ]
  const subnetIds: Record<string, string> = {}
  for (const [name, cidr, vid, sec, gw, vrf] of subnetDefs) {
    const info = cidrInfo(cidr)
    const id = nanoid()
    subnetIds[name] = id
    await db.query(
      `INSERT INTO ipmgt_subnets
        (id, name, network, version, prefix, netmask, vlan, vlan_ref, vrf_id, section_id, gateway, usage, created_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,0,$12,'seed')`,
      [id, name, `${info.network}/${info.prefix}`, info.version, info.prefix, info.netmask,
        vid, vid ? vlans[vid] : null, vrf ? vrfs[vrf] : null, sections[sec], gw, now]
    )
  }

  // A handful of example addresses on the server farm.
  const farm = subnetIds['Server farm']
  const addrDefs: [string, string, string, string][] = [
    ['10.0.1.10', 'web-01', 'used', 'Production web server'],
    ['10.0.1.11', 'web-02', 'used', 'Production web server'],
    ['10.0.1.20', 'app-01', 'used', 'Application server'],
    ['10.0.1.50', 'dhcp-pool', 'dhcp', 'Start of DHCP range'],
    ['10.0.1.100', 'reserved-vip', 'reserved', 'Reserved for future VIP'],
    ['10.0.1.200', 'old-host', 'deprecated', 'Decommissioned host']
  ]
  for (const [ip, host, status, desc] of addrDefs) {
    const id = nanoid()
    await db.query(
      `INSERT INTO ipmgt_ips (id, subnet_id, ip, hostname, description, status, state, created_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$6,$7,'seed')`,
      [id, farm, ip, host, desc, status, now]
    )
    await db.query(
      `INSERT INTO ipmgt_ip_history (id, ip_id, subnet_id, ip, action, actor, detail, changed_at)
       VALUES ($1,$2,$3,$4,'created','seed',$5,$6)`,
      [nanoid(), id, farm, ip, `status=${status}`, now]
    )
  }
}
