import { getIpamDb as getDb } from '~~/server/utils/moduleDb'
import { requireIpam } from '~~/layers/ipmgt/server/utils/ipamStore'

// Bulk export for one entity_type as JSON rows (CSV conversion happens
// client-side, same convention as Monitoring's export buttons). Columns
// mirror what import.post.ts accepts, so export -> edit -> import round-trips.
// Device SNMP credentials are never included (they're encrypted and the API
// never returns them anywhere, not even here).
const QUERIES: Record<string, string> = {
  section: `SELECT name, description, strict_mode, display_order, active FROM ipmgt_sections ORDER BY name`,
  subnet: `
    SELECT sub.network, sub.name, sub.description, sec.name AS section_name, vrf.name AS vrf_name,
           sub.gateway, sub.dns_servers, loc.name AS location_name, cust.name AS customer_name, sub.allow_requests
    FROM ipmgt_subnets sub
    LEFT JOIN ipmgt_sections sec ON sec.id = sub.section_id
    LEFT JOIN ipmgt_vrfs vrf ON vrf.id = sub.vrf_id
    LEFT JOIN ipmgt_locations loc ON loc.id = sub.location_id
    LEFT JOIN ipmgt_customers cust ON cust.id = sub.customer_id
    ORDER BY sub.network`,
  address: `
    SELECT a.ip, sub.network AS subnet_network, a.hostname, a.mac, coalesce(a.status, a.state, 'used') AS status,
           a.owner, a.device, a.description
    FROM ipmgt_ips a JOIN ipmgt_subnets sub ON sub.id = a.subnet_id
    ORDER BY sub.network, a.ip`,
  vlan: `
    SELECT v.vlan_id, v.name, v.description, d.name AS l2domain_name, loc.name AS location_name, cust.name AS customer_name
    FROM ipmgt_vlans v
    LEFT JOIN ipmgt_l2domains d ON d.id = v.l2domain_id
    LEFT JOIN ipmgt_locations loc ON loc.id = v.location_id
    LEFT JOIN ipmgt_customers cust ON cust.id = v.customer_id
    ORDER BY v.vlan_id`,
  vrf: `
    SELECT vrf.name, vrf.rd, vrf.description, vrf.owner, loc.name AS location_name, cust.name AS customer_name
    FROM ipmgt_vrfs vrf
    LEFT JOIN ipmgt_locations loc ON loc.id = vrf.location_id
    LEFT JOIN ipmgt_customers cust ON cust.id = vrf.customer_id
    ORDER BY vrf.name`,
  device: `
    SELECT dev.hostname, dev.display_name, dev.device_type, dev.vendor, dev.model, dev.serial_number,
           dev.asset_number, dev.management_ip, loc.name AS location_name, cust.name AS customer_name, dev.status
    FROM ipmgt_devices dev
    LEFT JOIN ipmgt_locations loc ON loc.id = dev.location_id
    LEFT JOIN ipmgt_customers cust ON cust.id = dev.customer_id
    ORDER BY dev.hostname`,
  location: `SELECT name, description, address, city, state, postal_code, country, location_type FROM ipmgt_locations ORDER BY name`,
  customer: `SELECT name, address, city, state, postal_code, contact_person, phone, email, status FROM ipmgt_customers ORDER BY name`
}

export default defineEventHandler(async (event) => {
  await requireIpam(event, 'viewer')
  const entityType = String(getQuery(event).entity_type || '')
  const sql = QUERIES[entityType]
  if (!sql) throw createError({ statusCode: 400, statusMessage: `Unknown or unexportable entity_type: ${entityType}` })
  const { rows } = await getDb().query(sql)
  return rows
})
