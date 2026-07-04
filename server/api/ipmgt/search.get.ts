import { getDb } from '../../utils/db'
import { requireIpam } from '../../utils/ipamStore'
import { isValidCidr, cidrInfo, ipInCidr, isValidIp } from '../../utils/ipam'

// Global IPAM search across addresses, subnets, VLANs, VRFs and sections.
// Supports exact/partial IP, hostname/mac/device/owner text, and CIDR lookup
// (a CIDR query returns the subnets that contain or match it).
export default defineEventHandler(async (event) => {
  await requireIpam(event, 'viewer')
  const term = String(getQuery(event).q || '').trim()
  if (!term) return { query: '', addresses: [], subnets: [], vlans: [], vrfs: [], sections: [] }
  const like = `%${term.toLowerCase()}%`
  const db = getDb()

  const [addrRes, subnetRes, vlanRes, vrfRes, sectionRes] = await Promise.all([
    db.query(
      `SELECT a.id, a.ip, a.hostname, a.mac, a.device, a.owner, a.status, a.state, sub.name AS subnet_name, a.subnet_id
       FROM ipmgt_ips a LEFT JOIN ipmgt_subnets sub ON sub.id = a.subnet_id
       WHERE lower(a.ip) LIKE $1 OR lower(coalesce(a.hostname,'')) LIKE $1 OR lower(coalesce(a.mac,'')) LIKE $1
         OR lower(coalesce(a.device,'')) LIKE $1 OR lower(coalesce(a.owner,'')) LIKE $1 OR lower(coalesce(a.description,'')) LIKE $1
       LIMIT 50`, [like]
    ),
    db.query(
      `SELECT id, name, network, version FROM ipmgt_subnets
       WHERE lower(name) LIKE $1 OR lower(network) LIKE $1 OR lower(coalesce(owner,'')) LIKE $1 OR lower(coalesce(description,'')) LIKE $1
       LIMIT 50`, [like]
    ),
    db.query(
      `SELECT id, vlan_id, name FROM ipmgt_vlans WHERE CAST(vlan_id AS TEXT) LIKE $2 OR lower(name) LIKE $1 LIMIT 50`,
      [like, `%${term}%`]
    ),
    db.query(`SELECT id, name, rd FROM ipmgt_vrfs WHERE lower(name) LIKE $1 OR lower(coalesce(rd,'')) LIKE $1 LIMIT 50`, [like]),
    db.query(`SELECT id, name FROM ipmgt_sections WHERE lower(name) LIKE $1 LIMIT 50`, [like])
  ])

  // CIDR / exact-IP lookup: which subnets contain the queried address/range.
  let containingSubnets: any[] = []
  if (isValidCidr(term) || isValidIp(term)) {
    const all = await db.query('SELECT id, name, network, version FROM ipmgt_subnets')
    const probe = isValidIp(term) ? term : cidrInfo(term).network
    containingSubnets = all.rows.filter((s: any) => ipInCidr(probe, s.network))
  }

  return {
    query: term,
    addresses: addrRes.rows.map((r: any) => ({ ...r, status: r.status || String(r.state || 'used').toLowerCase() })),
    subnets: subnetRes.rows,
    containingSubnets,
    vlans: vlanRes.rows,
    vrfs: vrfRes.rows,
    sections: sectionRes.rows
  }
})
