import { getDb } from '~~/server/utils/db'
import { requireIpam, ipamAudit, loadSubnet, assertNoSubnetOverlap } from '~~/layers/ipmgt/server/utils/ipamStore'
import { cidrInfo, isValidCidr } from '~~/layers/ipmgt/server/utils/ipam'

// Update a subnet. Changing the network re-validates the CIDR + overlap.
export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'operator')
  const id = getRouterParam(event, 'id')!
  const cur = await loadSubnet(id)
  const body = await readBody(event)
  const db = getDb()

  let network = cur.network
  let version = cur.version
  let prefix = cur.prefix
  let netmask = cur.netmask
  if (body.network !== undefined && String(body.network).trim() && String(body.network).trim() !== cur.network) {
    const raw = String(body.network).trim()
    if (!isValidCidr(raw)) throw createError({ statusCode: 400, statusMessage: `Invalid CIDR: ${raw}` })
    const info = cidrInfo(raw)
    network = `${info.network}/${info.prefix}`
    version = info.version
    prefix = info.prefix
    netmask = info.netmask
    await assertNoSubnetOverlap(network, {
      sectionId: body.section_id ?? cur.section_id,
      vrfId: body.vrf_id ?? cur.vrf_id,
      excludeId: id
    })
  }

  const g = (k: string, d: any) => (body[k] === undefined ? d : body[k])
  const b = (k: string, d: any) => (body[k] === undefined ? d : !!body[k])

  await db.query(
    `UPDATE ipmgt_subnets SET
       name = $2, network = $3, version = $4, prefix = $5, netmask = $6,
       vlan = $7, vlan_ref = $8, vrf_id = $9, section_id = $10, parent_id = $11,
       gateway = $12, dns_servers = $13, location = $14, owner = $15, description = $16,
       location_id = $17, customer_id = $18,
       allow_requests = $19, scan_enabled = $20, ping_enabled = $21, dns_resolve = $22, dhcp_range = $23,
       updated_at = $24, updated_by = $25
     WHERE id = $1`,
    [
      id,
      String(g('name', cur.name)).trim() || network,
      network, version, prefix, netmask,
      body.vlan_number !== undefined ? (body.vlan_number ? Number(body.vlan_number) : null) : cur.vlan,
      g('vlan_ref', cur.vlan_ref),
      g('vrf_id', cur.vrf_id),
      g('section_id', cur.section_id),
      g('parent_id', cur.parent_id),
      g('gateway', cur.gateway),
      g('dns_servers', cur.dns_servers),
      g('location', cur.location),
      g('owner', cur.owner),
      g('description', cur.description),
      body.location_id === undefined ? cur.location_id : (body.location_id || null),
      body.customer_id === undefined ? cur.customer_id : (body.customer_id || null),
      b('allow_requests', cur.allow_requests),
      b('scan_enabled', cur.scan_enabled),
      b('ping_enabled', cur.ping_enabled),
      b('dns_resolve', cur.dns_resolve),
      b('dhcp_range', cur.dhcp_range),
      new Date().toISOString(),
      user.username
    ]
  )
  await ipamAudit(user, 'ipmgt.subnet.update', id, { network })
  return { id, network }
})
