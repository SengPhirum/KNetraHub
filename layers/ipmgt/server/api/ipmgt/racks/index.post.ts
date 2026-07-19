import { nanoid } from 'nanoid'
import { getIpamDb as getDb } from '~~/server/utils/moduleDb'
import { requireIpam, ipamAudit } from '~~/layers/ipmgt/server/utils/ipamStore'

export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'operator')
  const body = await readBody(event)
  const name = String(body?.name || '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  const sizeU = Number(body.size_u) || 42
  if (sizeU < 1 || sizeU > 200) throw createError({ statusCode: 400, statusMessage: 'Rack size must be between 1 and 200U' })

  const id = nanoid()
  await getDb().query(
    `INSERT INTO ipmgt_racks (id, name, description, location_id, room, row_name, size_u, starting_unit, orientation, active, notes, created_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      id, name, body.description || null, body.location_id || null, body.room || null, body.row_name || null,
      sizeU, Number(body.starting_unit) || 1, body.orientation === 'bottom-up' ? 'bottom-up' : 'top-down',
      body.active === undefined ? true : !!body.active, body.notes || null,
      new Date().toISOString(), user.username
    ]
  )
  await ipamAudit(user, 'ipmgt.rack.create', id, { name })
  return { id }
})
