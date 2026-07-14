import { getDb } from '~~/server/utils/db'
import { requireIpam, ipamAudit } from '~~/layers/ipmgt/server/utils/ipamStore'

export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'operator')
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const db = getDb()
  const cur = await db.query('SELECT * FROM ipmgt_racks WHERE id = $1', [id])
  if (!cur.rows.length) throw createError({ statusCode: 404, statusMessage: 'Rack not found' })
  const row = cur.rows[0]
  const name = body.name !== undefined ? String(body.name).trim() : row.name
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  const sizeU = body.size_u === undefined ? row.size_u : Number(body.size_u)
  if (!sizeU || sizeU < 1 || sizeU > 200) throw createError({ statusCode: 400, statusMessage: 'Rack size must be between 1 and 200U' })

  if (body.size_u !== undefined && sizeU < row.size_u) {
    const overflow = await db.query('SELECT count(*)::int AS c FROM ipmgt_rack_items WHERE rack_id = $1 AND position_u + height_u - 1 > $2', [id, sizeU])
    if (Number(overflow.rows[0].c) > 0) {
      throw createError({ statusCode: 409, statusMessage: 'Cannot shrink the rack below items already placed in it' })
    }
  }

  await db.query(
    `UPDATE ipmgt_racks SET name=$2,description=$3,location_id=$4,room=$5,row_name=$6,size_u=$7,starting_unit=$8,orientation=$9,active=$10,notes=$11,updated_at=$12,updated_by=$13 WHERE id=$1`,
    [
      id, name,
      body.description === undefined ? row.description : body.description,
      body.location_id === undefined ? row.location_id : (body.location_id || null),
      body.room === undefined ? row.room : body.room,
      body.row_name === undefined ? row.row_name : body.row_name,
      sizeU,
      body.starting_unit === undefined ? row.starting_unit : Number(body.starting_unit) || 1,
      body.orientation === undefined ? row.orientation : (body.orientation === 'bottom-up' ? 'bottom-up' : 'top-down'),
      body.active === undefined ? row.active : !!body.active,
      body.notes === undefined ? row.notes : body.notes,
      new Date().toISOString(), user.username
    ]
  )
  await ipamAudit(user, 'ipmgt.rack.update', id, { name })
  return { id }
})
