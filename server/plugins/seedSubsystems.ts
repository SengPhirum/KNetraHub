import { getDb, waitForDb, migrate } from '../utils/db'
import { nanoid } from 'nanoid'
import { cidrInfo, isValidCidr } from '~~/layers/ipmgt/server/utils/ipam'

export default defineNitroPlugin(async () => {
  if (useRuntimeConfig().public.staticDocs) return

  setTimeout(async () => {
    try {
      await waitForDb()
      await migrate()

      const db = getDb()

      // Monitoring is populated from real devices (Monitoring > Devices > Add,
      // or auto-discovery) and kept live by the monitoring dispatcher; its own
      // schema/seed lifecycle lives in layers/monitoring/server/db/. Nothing is
      // seeded here.

      // IPAM module: backfill derived columns on any legacy rows, then seed a
      // realistic demo dataset (sections, VRFs, VLANs, subnets, addresses) the
      // first time — all idempotent.
      await seedIpamData(db)
    } catch (err) {
      console.error('[seed] Failed to seed MVP data:', err)
    }
  }, 3000) // Wait 3 seconds to let db initialize
})

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
