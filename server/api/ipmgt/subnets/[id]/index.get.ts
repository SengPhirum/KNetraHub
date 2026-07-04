import { getDb } from '../../../../utils/db'
import { requireIpam, loadSubnet, subnetUsage } from '../../../../utils/ipamStore'
import { cidrInfo } from '../../../../utils/ipam'

// Subnet detail: the row (+ joined names), computed CIDR facts, usage, and any
// child subnets nested under it.
export default defineEventHandler(async (event) => {
  await requireIpam(event, 'viewer')
  const id = getRouterParam(event, 'id')!
  const subnet = await loadSubnet(id)
  const db = getDb()

  const joins = await db.query(
    `SELECT sec.name AS section_name, v.vlan_id AS vlan_number, v.name AS vlan_name, vrf.name AS vrf_name
     FROM ipmgt_subnets sub
     LEFT JOIN ipmgt_sections sec ON sec.id = sub.section_id
     LEFT JOIN ipmgt_vlans v ON v.id = sub.vlan_ref
     LEFT JOIN ipmgt_vrfs vrf ON vrf.id = sub.vrf_id
     WHERE sub.id = $1`,
    [id]
  )
  const children = await db.query(
    'SELECT id, name, network, version, prefix FROM ipmgt_subnets WHERE parent_id = $1 ORDER BY network ASC',
    [id]
  )

  const info = cidrInfo(subnet.network)
  const usage = await subnetUsage(subnet)
  return {
    ...subnet,
    ...joins.rows[0],
    info: {
      version: info.version,
      network: info.network,
      prefix: info.prefix,
      netmask: info.netmask,
      wildcard: info.wildcard,
      broadcast: info.broadcast,
      firstUsable: info.firstUsable,
      lastUsable: info.lastUsable,
      total: info.total,
      usable: info.usable
    },
    usage,
    children: children.rows
  }
})
