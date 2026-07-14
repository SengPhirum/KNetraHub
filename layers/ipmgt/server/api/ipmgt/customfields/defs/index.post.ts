import { nanoid } from 'nanoid'
import { getDb } from '~~/server/utils/db'
import {
  requireIpam, ipamAudit, CUSTOM_FIELD_ENTITY_TYPES, CUSTOM_FIELD_TYPES
} from '~~/layers/ipmgt/server/utils/ipamStore'

const KEY_RE = /^[a-z][a-z0-9_]*$/

// Create a custom field definition. Admin-only (module configuration, same
// tier as ipmgt settings). field_key must be a stable machine identifier
// (lowercase snake_case) unique within its entity_type.
export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'admin')
  const body = await readBody(event)

  const entityType = String(body?.entity_type || '')
  if (!(CUSTOM_FIELD_ENTITY_TYPES as readonly string[]).includes(entityType)) {
    throw createError({ statusCode: 400, statusMessage: `entity_type must be one of: ${CUSTOM_FIELD_ENTITY_TYPES.join(', ')}` })
  }
  const fieldType = String(body?.field_type || 'text')
  if (!(CUSTOM_FIELD_TYPES as readonly string[]).includes(fieldType)) {
    throw createError({ statusCode: 400, statusMessage: `field_type must be one of: ${CUSTOM_FIELD_TYPES.join(', ')}` })
  }
  const fieldKey = String(body?.field_key || '').trim().toLowerCase()
  if (!KEY_RE.test(fieldKey)) {
    throw createError({ statusCode: 400, statusMessage: 'field_key must start with a letter and contain only lowercase letters, numbers, and underscores' })
  }
  const label = String(body?.label || '').trim()
  if (!label) throw createError({ statusCode: 400, statusMessage: 'Label is required' })
  if (['select', 'multiselect'].includes(fieldType)) {
    const opts = Array.isArray(body?.options) ? body.options : []
    if (!opts.length) throw createError({ statusCode: 400, statusMessage: 'Select fields need at least one option' })
  }

  const db = getDb()
  const dup = await db.query('SELECT 1 FROM ipmgt_custom_field_defs WHERE entity_type = $1 AND field_key = $2', [entityType, fieldKey])
  if (dup.rows.length) throw createError({ statusCode: 409, statusMessage: `Field "${fieldKey}" already exists for ${entityType}` })

  const id = nanoid()
  await db.query(
    `INSERT INTO ipmgt_custom_field_defs (
      id, entity_type, field_key, label, field_type, options, default_value,
      required, unique_value, searchable, visible_list, visible_detail, visible_export,
      display_order, active, created_at, created_by
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
    [
      id, entityType, fieldKey, label, fieldType,
      Array.isArray(body.options) ? JSON.stringify(body.options) : null,
      body.default_value || null,
      !!body.required, !!body.unique_value, !!body.searchable,
      body.visible_list === undefined ? true : !!body.visible_list,
      body.visible_detail === undefined ? true : !!body.visible_detail,
      body.visible_export === undefined ? true : !!body.visible_export,
      Number(body.display_order) || 0,
      body.active === undefined ? true : !!body.active,
      new Date().toISOString(), user.username
    ]
  )
  await ipamAudit(user, 'ipmgt.customfield.create', id, { entity_type: entityType, field_key: fieldKey })
  return { id }
})
