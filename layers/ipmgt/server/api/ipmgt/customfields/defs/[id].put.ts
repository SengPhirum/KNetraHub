import { getDb } from '~~/server/utils/db'
import { requireIpam, ipamAudit, CUSTOM_FIELD_TYPES } from '~~/layers/ipmgt/server/utils/ipamStore'

// Update a custom field definition. entity_type and field_key are immutable
// once created (changing either would orphan existing values) - only label,
// type-affecting options, flags, and ordering can change.
export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'admin')
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const db = getDb()
  const cur = await db.query('SELECT * FROM ipmgt_custom_field_defs WHERE id = $1', [id])
  if (!cur.rows.length) throw createError({ statusCode: 404, statusMessage: 'Custom field not found' })
  const row = cur.rows[0]

  const label = body.label !== undefined ? String(body.label).trim() : row.label
  if (!label) throw createError({ statusCode: 400, statusMessage: 'Label is required' })
  const fieldType = body.field_type === undefined ? row.field_type : String(body.field_type)
  if (!(CUSTOM_FIELD_TYPES as readonly string[]).includes(fieldType)) {
    throw createError({ statusCode: 400, statusMessage: `field_type must be one of: ${CUSTOM_FIELD_TYPES.join(', ')}` })
  }

  await db.query(
    `UPDATE ipmgt_custom_field_defs SET
       label = $2, field_type = $3, options = $4, default_value = $5,
       required = $6, unique_value = $7, searchable = $8,
       visible_list = $9, visible_detail = $10, visible_export = $11,
       display_order = $12, active = $13, updated_at = $14, updated_by = $15
     WHERE id = $1`,
    [
      id, label, fieldType,
      body.options === undefined ? row.options : (Array.isArray(body.options) ? JSON.stringify(body.options) : null),
      body.default_value === undefined ? row.default_value : body.default_value,
      body.required === undefined ? row.required : !!body.required,
      body.unique_value === undefined ? row.unique_value : !!body.unique_value,
      body.searchable === undefined ? row.searchable : !!body.searchable,
      body.visible_list === undefined ? row.visible_list : !!body.visible_list,
      body.visible_detail === undefined ? row.visible_detail : !!body.visible_detail,
      body.visible_export === undefined ? row.visible_export : !!body.visible_export,
      body.display_order === undefined ? row.display_order : Number(body.display_order) || 0,
      body.active === undefined ? row.active : !!body.active,
      new Date().toISOString(), user.username
    ]
  )
  await ipamAudit(user, 'ipmgt.customfield.update', id, { field_key: row.field_key })
  return { id }
})
