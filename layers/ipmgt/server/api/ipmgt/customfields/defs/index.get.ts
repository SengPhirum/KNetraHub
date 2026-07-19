import { getIpamDb as getDb } from '~~/server/utils/moduleDb'
import { requireIpam, CUSTOM_FIELD_ENTITY_TYPES } from '~~/layers/ipmgt/server/utils/ipamStore'

// List custom field definitions, optionally filtered by entity_type. Readable
// by any ipmgt viewer so entity forms can render their fields; only admins
// (ipmgt.settings) may create/edit/delete definitions.
export default defineEventHandler(async (event) => {
  await requireIpam(event, 'viewer')
  const q = getQuery(event)
  const where: string[] = []
  const params: any[] = []
  if (q.entity_type) {
    if (!(CUSTOM_FIELD_ENTITY_TYPES as readonly string[]).includes(String(q.entity_type))) {
      throw createError({ statusCode: 400, statusMessage: `Unknown entity_type: ${q.entity_type}` })
    }
    params.push(q.entity_type)
    where.push(`entity_type = $${params.length}`)
  }
  if (q.active !== undefined) {
    params.push(q.active === 'true')
    where.push(`active = $${params.length}`)
  }
  const { rows } = await getDb().query(
    `SELECT * FROM ipmgt_custom_field_defs
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY entity_type ASC, display_order ASC, label ASC`,
    params
  )
  return rows
})
