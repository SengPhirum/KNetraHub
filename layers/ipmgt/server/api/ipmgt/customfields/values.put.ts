import { nanoid } from 'nanoid'
import { getDb } from '~~/server/utils/db'
import {
  requireIpam, ipamAudit, CUSTOM_FIELD_ENTITY_TYPES, validateCustomFieldValue
} from '~~/layers/ipmgt/server/utils/ipamStore'

// Bulk upsert custom field values for one entity. Called as a second step
// right after the entity itself is created/updated (custom field values live
// in a separate table, not inline on each entity's own columns). Validates
// every posted value against its field definition (type, required, unique)
// before writing any of them.
export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'operator')
  const body = await readBody(event)
  const entityType = String(body?.entity_type || '')
  const entityId = String(body?.entity_id || '')
  if (!(CUSTOM_FIELD_ENTITY_TYPES as readonly string[]).includes(entityType)) {
    throw createError({ statusCode: 400, statusMessage: `entity_type must be one of: ${CUSTOM_FIELD_ENTITY_TYPES.join(', ')}` })
  }
  if (!entityId) throw createError({ statusCode: 400, statusMessage: 'entity_id is required' })
  const posted: Record<string, unknown> = body?.values && typeof body.values === 'object' ? body.values : {}

  const db = getDb()
  const defsRes = await db.query(
    'SELECT * FROM ipmgt_custom_field_defs WHERE entity_type = $1 AND active = true',
    [entityType]
  )

  const toWrite: { fieldId: string; value: string | null }[] = []
  for (const def of defsRes.rows) {
    const value = validateCustomFieldValue(def, posted[def.id])
    if (value !== null && def.unique_value) {
      const dup = await db.query(
        'SELECT 1 FROM ipmgt_custom_field_values WHERE field_id = $1 AND value = $2 AND entity_id <> $3',
        [def.id, value, entityId]
      )
      if (dup.rows.length) throw createError({ statusCode: 409, statusMessage: `"${def.label}" value "${value}" is already used by another ${entityType}` })
    }
    toWrite.push({ fieldId: def.id, value })
  }

  const now = new Date().toISOString()
  for (const { fieldId, value } of toWrite) {
    if (value === null) {
      await db.query('DELETE FROM ipmgt_custom_field_values WHERE field_id = $1 AND entity_id = $2', [fieldId, entityId])
    } else {
      await db.query(
        `INSERT INTO ipmgt_custom_field_values (id, field_id, entity_type, entity_id, value, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$6)
         ON CONFLICT (field_id, entity_id) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
        [nanoid(), fieldId, entityType, entityId, value, now]
      )
    }
  }
  await ipamAudit(user, 'ipmgt.customfield.values.update', entityId, { entity_type: entityType, fields: toWrite.length })
  return { ok: true }
})
