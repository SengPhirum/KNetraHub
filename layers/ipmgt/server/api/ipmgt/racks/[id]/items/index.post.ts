import { nanoid } from 'nanoid'
import { getIpamDb as getDb } from '~~/server/utils/moduleDb'
import { requireIpam, ipamAudit } from '~~/layers/ipmgt/server/utils/ipamStore'

const ITEM_TYPES = ['device', 'patch-panel', 'pdu', 'shelf', 'chassis', 'blank', 'other']

// Place an item in a rack. Validates it fits within the rack's U range and
// doesn't overlap an existing item on the same face.
export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'operator')
  const rackId = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const db = getDb()

  const rackRes = await db.query('SELECT * FROM ipmgt_racks WHERE id = $1', [rackId])
  if (!rackRes.rows.length) throw createError({ statusCode: 404, statusMessage: 'Rack not found' })
  const rack = rackRes.rows[0]

  const name = String(body?.name || '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  const positionU = Number(body.position_u)
  const heightU = Number(body.height_u) || 1
  if (!Number.isInteger(positionU) || positionU < rack.starting_unit) {
    throw createError({ statusCode: 400, statusMessage: `Position must be a whole number >= ${rack.starting_unit}` })
  }
  if (!Number.isInteger(heightU) || heightU < 1) throw createError({ statusCode: 400, statusMessage: 'Height must be a positive whole number of U' })
  const top = positionU + heightU - 1
  if (top > rack.starting_unit + rack.size_u - 1) {
    throw createError({ statusCode: 409, statusMessage: `Item extends past the rack (${rack.size_u}U, starting at U${rack.starting_unit})` })
  }
  const side = body.side === 'rear' ? 'rear' : 'front'
  const itemType = ITEM_TYPES.includes(body.item_type) ? body.item_type : 'device'

  const overlap = await db.query(
    `SELECT name, position_u, height_u FROM ipmgt_rack_items
     WHERE rack_id = $1 AND side = $2 AND position_u <= $3 AND (position_u + height_u - 1) >= $4`,
    [rackId, side, top, positionU]
  )
  if (overlap.rows.length) {
    throw createError({ statusCode: 409, statusMessage: `Overlaps "${overlap.rows[0].name}" at U${overlap.rows[0].position_u}-${overlap.rows[0].position_u + overlap.rows[0].height_u - 1}` })
  }

  const id = nanoid()
  const now = new Date().toISOString()
  await db.query(
    `INSERT INTO ipmgt_rack_items (id, rack_id, device_id, name, item_type, position_u, height_u, side, color, notes, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)`,
    [id, rackId, body.device_id || null, name, itemType, positionU, heightU, side, body.color || null, body.notes || null, now]
  )
  await ipamAudit(user, 'ipmgt.rack.item.create', id, { rack: rack.name, name, position_u: positionU })
  return { id }
})
