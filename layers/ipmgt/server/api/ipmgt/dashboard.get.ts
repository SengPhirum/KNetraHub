import { getDb } from '~~/server/utils/db'
import { requireIpam } from '~~/layers/ipmgt/server/utils/ipamStore'
import { getAppSetting } from '~~/server/utils/store'
import { usableCapacity } from '~~/layers/ipmgt/server/utils/ipam'

// Dashboard summary: entity counts, IPv4/IPv6 capacity/usage, status breakdown,
// high-usage subnets, per-section usage, and recent address activity.
export default defineEventHandler(async (event) => {
  await requireIpam(event, 'viewer')
  const db = getDb()

  const threshold = await highUsageThreshold()

  const [subnetsRes, statusRes, sectionsRes, vlansRes, vrfsRes, recentRes, locationsRes, customersRes, devicesRes] = await Promise.all([
    db.query('SELECT id, name, network, version, section_id, gateway FROM ipmgt_subnets'),
    db.query(`SELECT lower(coalesce(status, state, 'used')) AS st, count(*)::int AS c FROM ipmgt_ips GROUP BY 1`),
    db.query('SELECT id, name FROM ipmgt_sections'),
    db.query('SELECT count(*)::int AS c FROM ipmgt_vlans'),
    db.query('SELECT count(*)::int AS c FROM ipmgt_vrfs'),
    db.query(`SELECT a.id, a.ip, a.hostname, a.status, a.state, a.created_at, a.updated_at, sub.name AS subnet_name
              FROM ipmgt_ips a LEFT JOIN ipmgt_subnets sub ON sub.id = a.subnet_id
              ORDER BY coalesce(a.updated_at, a.created_at) DESC NULLS LAST LIMIT 8`),
    db.query('SELECT count(*)::int AS c FROM ipmgt_locations'),
    db.query('SELECT count(*)::int AS c FROM ipmgt_customers'),
    db.query('SELECT count(*)::int AS c FROM ipmgt_devices')
  ])

  // Per-subnet used counts in one grouped query.
  const usedRes = await db.query('SELECT subnet_id, count(*)::int AS c FROM ipmgt_ips GROUP BY subnet_id')
  const usedBySubnet = new Map<string, number>(usedRes.rows.map((r: any) => [r.subnet_id, Number(r.c)]))

  let v4Cap = 0, v4Used = 0, v4Subnets = 0
  let v6Subnets = 0
  const sectionAgg = new Map<string, { capacity: number; used: number }>()
  const highUsage: any[] = []

  for (const s of subnetsRes.rows) {
    const used = usedBySubnet.get(s.id) || 0
    const cap = usableCapacity(s.network)
    if (s.version === 6) v6Subnets++
    else { v4Subnets++; v4Cap += cap; v4Used += used }

    if (s.section_id) {
      const agg = sectionAgg.get(s.section_id) || { capacity: 0, used: 0 }
      agg.capacity += cap; agg.used += used
      sectionAgg.set(s.section_id, agg)
    }
    const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0
    if (pct >= threshold) highUsage.push({ id: s.id, name: s.name, network: s.network, used, capacity: cap, percent: pct })
  }
  highUsage.sort((a, b) => b.percent - a.percent)

  const sectionNames = new Map<string, string>(sectionsRes.rows.map((r: any) => [r.id, r.name]))
  const bySection = [...sectionAgg.entries()].map(([id, v]) => ({
    id, name: sectionNames.get(id) || 'Unknown',
    capacity: v.capacity, used: v.used,
    percent: v.capacity > 0 ? Math.min(100, Math.round((v.used / v.capacity) * 100)) : 0
  })).sort((a, b) => b.percent - a.percent)

  const statusSummary: Record<string, number> = { used: 0, reserved: 0, dhcp: 0, offline: 0, deprecated: 0, gateway: 0 }
  for (const r of statusRes.rows) statusSummary[r.st] = (statusSummary[r.st] || 0) + Number(r.c)
  const totalUsed = Object.values(statusSummary).reduce((a, b) => a + b, 0)

  return {
    counts: {
      sections: sectionsRes.rows.length,
      subnets: subnetsRes.rows.length,
      vlans: Number(vlansRes.rows[0].c),
      vrfs: Number(vrfsRes.rows[0].c),
      addresses: totalUsed,
      locations: Number(locationsRes.rows[0].c),
      customers: Number(customersRes.rows[0].c),
      devices: Number(devicesRes.rows[0].c)
    },
    ipv4: { subnets: v4Subnets, capacity: v4Cap, used: v4Used, free: Math.max(0, v4Cap - v4Used), percent: v4Cap > 0 ? Math.min(100, Math.round((v4Used / v4Cap) * 100)) : 0 },
    ipv6: { subnets: v6Subnets },
    statusSummary,
    highUsageThreshold: threshold,
    highUsageSubnets: highUsage.slice(0, 10),
    bySection,
    recent: recentRes.rows.map((r: any) => ({ ...r, status: r.status || String(r.state || 'used').toLowerCase() }))
  }
})

async function highUsageThreshold(): Promise<number> {
  try {
    const raw = await getAppSetting('ipmgt_settings')
    if (raw) {
      const parsed = JSON.parse(raw)
      const t = Number(parsed?.usageWarningThreshold)
      if (Number.isFinite(t) && t > 0 && t <= 100) return t
    }
  } catch { /* fall through */ }
  return 80
}
