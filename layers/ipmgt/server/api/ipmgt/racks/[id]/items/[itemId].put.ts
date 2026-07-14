import { getDb } from '~~/server/utils/db'
import { requireIpam, ipamAudit } from '~~/layers/ipmgt/server/utils/ipamStore'

const ITEM_TYPES = ['device', 'patch-panel', 'pdu', 'shelf', 'chassis', 'blank', 'other']

export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'operator')
  const rackId = getRouterParam(event, 'id')!
  const itemId = getRouterParam(event, 'itemId')!
  const body = await readBody(event)
  const db = getDb()

  const rackRes = await db.query('SELECT * FROM ipmgt_racks WHERE id = $1', [rackId])
  if (!rackRes.rows.length) throw createError({ statusCode: 404, statusMessage: 'Rack not found' })
  const rack = rackRes.rows[0]
  const curRes = await db.query('SELECT * FROM ipmgt_rack_items WHERE id = $1 AND rack_id = $2', [itemId, rackId])
  if (!curRes.rows.length) throw createError({ statusCode: 404, statusMessage: 'Rack item not found' })
  const cur = curRes.rows[0]

  const name = body.name !== undefined ? String(body.name).trim() : cur.name
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  const positionU = body.position_u === undefined ? cur.position_u : Number(body.position_u)
  const heightU = body.height_u === undefined ? cur.height_u : Number(body.height_u)
  const side = body.side === undefined ? cur.side : (body.side === 'rear' ? 'rear' : 'front')
  if (!Number.isInteger(positionU) || positionU < rack.starting_unit) throw createError({ statusCode: 400, statusMessage: `Position must be a whole number >= ${rack.starting_unit}` })
  if (!Number.isInteger(heightU) || heightU < 1) throw createError({ statusCode: 400, statusMessage: 'Height must be a positive whole number of U' })
  const top = positionU + heightU - 1
  if (top > rack.starting_unit + rack.size_u - 1) throw createError({ statusCode: 409, statusMessage: `Item extends past the rack (${rack.size_u}U)` })

  const overlap = await db.query(
    `SELECT name, position_u, height_u FROM ipmgt_rack_items
     WHERE rack_id = $1 AND side = $2 AND id <> $3 AND position_u <= $4 AND (position_u + height_u - 1) >= $5`,
    [rackId, side, itemId, top, positionU]
  )
  if (overlap.rows.length) {
    throw createError({ statusCode: 409, statusMessage: `Overlaps "${overlap.rows[0].name}" at U${overlap.rows[0].position_u}-${overlap.rows[0].position_u + overlap.rows[0].height_u - 1}` })
  }

  await db.query(
    `UPDATE ipmgt_rack_items SET device_id=$2,name=$3,item_type=$4,position_u=$5,height_u=$6,side=$7,color=$8,notes=$9,updated_at=$10 WHERE id=$1`,
    [
      itemId,
      body.device_id === undefined ? cur.device_id : (body.device_id || null),
      name,
      body.item_type === undefined ? cur.item_type : (ITEM_TYPES.includes(body.item_type) ? body.item_type : cur.item_type),
      positionU, heightU, side,
      body.color === undefined ? cur.color : body.color,
      body.notes === undefined ? cur.notes : body.notes,
      new Date().toISOString()
    ]
  )
  await ipamAudit(user, 'ipmgt.rack.item.update', itemId, { rack: rack.name, name })
  return { id: itemId }
})
