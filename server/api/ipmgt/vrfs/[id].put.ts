import { getDb } from '../../../utils/db'
import { requireIpam, ipamAudit } from '../../../utils/ipamStore'

export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'operator')
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const db = getDb()
  const cur = await db.query('SELECT * FROM ipmgt_vrfs WHERE id = $1', [id])
  if (!cur.rows.length) throw createError({ statusCode: 404, statusMessage: 'VRF not found' })
  const row = cur.rows[0]
  await db.query(
    `UPDATE ipmgt_vrfs SET name = $2, rd = $3, description = $4, owner = $5, location = $6, active = $7, updated_at = $8 WHERE id = $1`,
    [
      id,
      body.name === undefined ? row.name : String(body.name).trim(),
      body.rd === undefined ? row.rd : body.rd,
      body.description === undefined ? row.description : body.description,
      body.owner === undefined ? row.owner : body.owner,
      body.location === undefined ? row.location : body.location,
      body.active === undefined ? row.active : !!body.active,
      new Date().toISOString()
    ]
  )
  await ipamAudit(user, 'ipmgt.vrf.update', id, { name: row.name })
  return { id }
})
