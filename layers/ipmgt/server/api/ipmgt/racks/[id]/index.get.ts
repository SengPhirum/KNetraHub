import { getDb } from '~~/server/utils/db'
import { requireIpam } from '~~/layers/ipmgt/server/utils/ipamStore'

// Rack detail: the rack row plus every placed item (with joined device info).
export default defineEventHandler(async (event) => {
  await requireIpam(event, 'viewer')
  const id = getRouterParam(event, 'id')!
  const db = getDb()

  const rackRes = await db.query(
    `SELECT r.*, loc.name AS location_name FROM ipmgt_racks r LEFT JOIN ipmgt_locations loc ON loc.id = r.location_id WHERE r.id = $1`,
    [id]
  )
  if (!rackRes.rows.length) throw createError({ statusCode: 404, statusMessage: 'Rack not found' })

  const items = await db.query(
    `SELECT i.*, dev.hostname AS device_hostname, dev.device_type AS device_type
     FROM ipmgt_rack_items i LEFT JOIN ipmgt_devices dev ON dev.id = i.device_id
     WHERE i.rack_id = $1 ORDER BY i.position_u ASC`,
    [id]
  )
  return { ...rackRes.rows[0], items: items.rows }
})
