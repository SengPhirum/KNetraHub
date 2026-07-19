import { getIpamDb as getDb } from '~~/server/utils/moduleDb'
import { requireIpam } from '~~/layers/ipmgt/server/utils/ipamStore'
import { subnetUsage } from '~~/layers/ipmgt/server/utils/ipamStore'

// Section detail: the section plus its subnets (each with live usage).
export default defineEventHandler(async (event) => {
  await requireIpam(event, 'viewer')
  const id = getRouterParam(event, 'id')
  const db = getDb()

  const secRes = await db.query('SELECT * FROM ipmgt_sections WHERE id = $1', [id])
  if (!secRes.rows.length) throw createError({ statusCode: 404, statusMessage: 'Section not found' })

  const subRes = await db.query(
    `SELECT sub.*, v.vlan_id AS vlan_number, v.name AS vlan_name, vrf.name AS vrf_name
     FROM ipmgt_subnets sub
     LEFT JOIN ipmgt_vlans v ON v.id = sub.vlan_ref
     LEFT JOIN ipmgt_vrfs vrf ON vrf.id = sub.vrf_id
     WHERE sub.section_id = $1
     ORDER BY sub.network ASC`,
    [id]
  )
  const subnets = await Promise.all(
    subRes.rows.map(async (s: any) => ({ ...s, usage: await subnetUsage(s) }))
  )
  return { section: secRes.rows[0], subnets }
})
