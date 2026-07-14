import { getDb } from '~~/server/utils/db'
import { requireIpam, subnetUsage } from '~~/layers/ipmgt/server/utils/ipamStore'

// List subnets (optionally filtered) with joined section/vlan/vrf names and
// live usage. Filters: section_id, vrf_id, version (4|6), q (name/CIDR search).
export default defineEventHandler(async (event) => {
  await requireIpam(event, 'viewer')
  const q = getQuery(event)
  const where: string[] = []
  const params: any[] = []

  if (q.section_id) { params.push(q.section_id); where.push(`sub.section_id = $${params.length}`) }
  if (q.vrf_id) { params.push(q.vrf_id); where.push(`sub.vrf_id = $${params.length}`) }
  if (q.version) { params.push(Number(q.version)); where.push(`sub.version = $${params.length}`) }
  if (q.q) { params.push(`%${String(q.q).toLowerCase()}%`); where.push(`(lower(sub.name) LIKE $${params.length} OR lower(sub.network) LIKE $${params.length})`) }

  const { rows } = await getDb().query(
    `SELECT sub.*,
       sec.name AS section_name,
       v.vlan_id AS vlan_number, v.name AS vlan_name,
       vrf.name AS vrf_name,
       loc.name AS location_name, cust.name AS customer_name
     FROM ipmgt_subnets sub
     LEFT JOIN ipmgt_sections sec ON sec.id = sub.section_id
     LEFT JOIN ipmgt_vlans v ON v.id = sub.vlan_ref
     LEFT JOIN ipmgt_vrfs vrf ON vrf.id = sub.vrf_id
     LEFT JOIN ipmgt_locations loc ON loc.id = sub.location_id
     LEFT JOIN ipmgt_customers cust ON cust.id = sub.customer_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY sub.version ASC, sub.network ASC`,
    params
  )
  return Promise.all(rows.map(async (s: any) => ({ ...s, usage: await subnetUsage(s) })))
})
