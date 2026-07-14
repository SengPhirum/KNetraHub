import { nanoid } from 'nanoid'
import { getDb } from '~~/server/utils/db'
import { requireIpam, ipamAudit, assertNoSubnetOverlap } from '~~/layers/ipmgt/server/utils/ipamStore'
import { cidrInfo, isValidCidr } from '~~/layers/ipmgt/server/utils/ipam'

// Create a subnet from a CIDR. Validates the CIDR, derives version/prefix/
// netmask, and rejects overlap within the same section/VRF.
export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'operator')
  const body = await readBody(event)
  const network = String(body?.network || '').trim()
  if (!isValidCidr(network)) throw createError({ statusCode: 400, statusMessage: `Invalid CIDR: ${network || '(empty)'}` })

  const info = cidrInfo(network)
  const canonical = `${info.network}/${info.prefix}`

  await assertNoSubnetOverlap(canonical, { sectionId: body.section_id || null, vrfId: body.vrf_id || null })

  const id = nanoid()
  const now = new Date().toISOString()
  await getDb().query(
    `INSERT INTO ipmgt_subnets
      (id, name, network, version, prefix, netmask, vlan, vlan_ref, vrf_id, section_id, parent_id,
       gateway, dns_servers, location, owner, location_id, customer_id, description,
       allow_requests, scan_enabled, ping_enabled, dns_resolve, dhcp_range,
       usage, created_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,0,$24,$25)`,
    [
      id,
      String(body.name || canonical).trim(),
      canonical,
      info.version,
      info.prefix,
      info.netmask,
      body.vlan_number ? Number(body.vlan_number) : null,
      body.vlan_ref || null,
      body.vrf_id || null,
      body.section_id || null,
      body.parent_id || null,
      body.gateway || null,
      body.dns_servers || null,
      body.location || null,
      body.owner || null,
      body.location_id || null,
      body.customer_id || null,
      body.description || null,
      !!body.allow_requests,
      !!body.scan_enabled,
      !!body.ping_enabled,
      !!body.dns_resolve,
      !!body.dhcp_range,
      now,
      user.username
    ]
  )
  await ipamAudit(user, 'ipmgt.subnet.create', id, { network: canonical })
  return { id, network: canonical }
})
