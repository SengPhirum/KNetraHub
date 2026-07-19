import { getDb } from '~~/server/utils/db'
import { requireIpam } from '~~/layers/ipmgt/server/utils/ipamStore'

export default defineEventHandler(async (event) => {
  await requireIpam(event, 'viewer')
  const { rows } = await getDb().query(`
    SELECT r.*, loc.name AS location_name,
      (SELECT count(*)::int FROM ipmgt_rack_items i WHERE i.rack_id = r.id) AS item_count,
      (SELECT coalesce(sum(i.height_u),0)::int FROM ipmgt_rack_items i WHERE i.rack_id = r.id AND i.side = 'front') AS used_u,
      (SELECT coalesce(json_agg(json_build_object(
          'id', i.id, 'name', i.name, 'item_type', i.item_type,
          'position_u', i.position_u, 'height_u', i.height_u, 'side', i.side, 'color', i.color
        ) ORDER BY i.position_u), '[]'::json)
        FROM ipmgt_rack_items i WHERE i.rack_id = r.id) AS items
    FROM ipmgt_racks r
    LEFT JOIN ipmgt_locations loc ON loc.id = r.location_id
    ORDER BY r.name ASC
  `)
  return rows
})
