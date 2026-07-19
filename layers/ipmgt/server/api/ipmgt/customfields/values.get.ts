import { getIpamDb as getDb } from '~~/server/utils/moduleDb'
import { requireIpam, CUSTOM_FIELD_ENTITY_TYPES } from '~~/layers/ipmgt/server/utils/ipamStore'

// Active custom field definitions for an entity_type, plus the current values
// for a specific entity_id (empty values if entity_id is omitted - the
// "not yet created" state used by create forms).
export default defineEventHandler(async (event) => {
  await requireIpam(event, 'viewer')
  const q = getQuery(event)
  const entityType = String(q.entity_type || '')
  if (!(CUSTOM_FIELD_ENTITY_TYPES as readonly string[]).includes(entityType)) {
    throw createError({ statusCode: 400, statusMessage: `entity_type must be one of: ${CUSTOM_FIELD_ENTITY_TYPES.join(', ')}` })
  }
  const db = getDb()
  const defs = await db.query(
    'SELECT * FROM ipmgt_custom_field_defs WHERE entity_type = $1 AND active = true ORDER BY display_order ASC, label ASC',
    [entityType]
  )
  let values: Record<string, string> = {}
  if (q.entity_id) {
    const { rows } = await db.query(
      'SELECT field_id, value FROM ipmgt_custom_field_values WHERE entity_type = $1 AND entity_id = $2',
      [entityType, String(q.entity_id)]
    )
    values = Object.fromEntries(rows.map((r: any) => [r.field_id, r.value]))
  }
  return { defs: defs.rows, values }
})
