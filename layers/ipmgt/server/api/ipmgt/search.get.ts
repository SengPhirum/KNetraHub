import { getDb } from '~~/server/utils/db'
import { requireIpam } from '~~/layers/ipmgt/server/utils/ipamStore'
import { isValidCidr, cidrInfo, ipInCidr, isValidIp } from '~~/layers/ipmgt/server/utils/ipam'

// Global IPAM search across addresses, subnets, VLANs, VRFs and sections.
// Supports exact/partial IP, hostname/mac/device/owner text, and CIDR lookup
// (a CIDR query returns the subnets that contain or match it).
export default defineEventHandler(async (event) => {
  await requireIpam(event, 'viewer')
  const term = String(getQuery(event).q || '').trim()
  if (!term) return { query: '', addresses: [], subnets: [], vlans: [], vrfs: [], sections: [], devices: [], locations: [], customers: [] }
  const like = `%${term.toLowerCase()}%`
  const db = getDb()

  const [addrRes, subnetRes, vlanRes, vrfRes, sectionRes, deviceRes, locationRes, customerRes] = await Promise.all([
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
    db.query(`SELECT id, name FROM ipmgt_sections WHERE lower(name) LIKE $1 LIMIT 50`, [like]),
    db.query(
      `SELECT id, hostname, display_name, device_type, management_ip FROM ipmgt_devices
       WHERE lower(hostname) LIKE $1 OR lower(coalesce(display_name,'')) LIKE $1 OR lower(coalesce(vendor,'')) LIKE $1
         OR lower(coalesce(model,'')) LIKE $1 OR lower(coalesce(serial_number,'')) LIKE $1
         OR lower(coalesce(asset_number,'')) LIKE $1 OR lower(coalesce(management_ip,'')) LIKE $1
       LIMIT 50`, [like]
    ),
    db.query(
      `SELECT id, name, city, country FROM ipmgt_locations
       WHERE lower(name) LIKE $1 OR lower(coalesce(city,'')) LIKE $1 OR lower(coalesce(address,'')) LIKE $1
       LIMIT 50`, [like]
    ),
    db.query(
      `SELECT id, name, contact_person, email FROM ipmgt_customers
       WHERE lower(name) LIKE $1 OR lower(coalesce(contact_person,'')) LIKE $1 OR lower(coalesce(email,'')) LIKE $1
       LIMIT 50`, [like]
    )
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
    sections: sectionRes.rows,
    devices: deviceRes.rows,
    locations: locationRes.rows,
    customers: customerRes.rows
  }
})
