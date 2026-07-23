import { getWork, optionalText, requireText, requireWork } from '~~/layers/work/server/utils/workStore'
import { assertFolderAccess, assertListAccess, assertSpaceAccess } from '~~/layers/work/server/utils/workAccess'
import { normalizeOptions } from '~~/layers/work/server/utils/workFields'

/** Update a field definition (name, description, required, options, order, archive). */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWork(event, 'manager')
  const fieldId = String(getRouterParam(event, 'id'))
  const db = getWork()
  const { rows } = await db.query('SELECT * FROM work.custom_fields WHERE id = $1 AND workspace_id = $2', [fieldId, workspaceId])
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Custom field not found' })
  const field = rows[0]
  if (field.scope_type === 'workspace') {
    if (tier !== 'admin') throw createError({ statusCode: 403, statusMessage: 'Workspace-wide fields require admin access to Work' })
  } else if (field.scope_type === 'space') await assertSpaceAccess(user, tier, workspaceId, field.scope_id, 'edit')
  else if (field.scope_type === 'folder') await assertFolderAccess(user, tier, workspaceId, field.scope_id, 'edit')
  else if (field.scope_type === 'list') await assertListAccess(user, tier, workspaceId, field.scope_id, 'edit')

  const body = await readBody(event)
  if (body?.version !== undefined && Number(body.version) !== field.version) {
    throw createError({ statusCode: 409, statusMessage: 'This field was changed by someone else. Reload and retry.' })
  }

  const sets: string[] = []
  const params: unknown[] = []
  const set = (column: string, value: unknown) => { params.push(value); sets.push(`${column} = $${params.length}`) }

  if (body?.name !== undefined) set('name', requireText(body.name, 'Field name', 100))
  if (body?.description !== undefined) set('description', optionalText(body.description, 'Description', 500))
  if (body?.required !== undefined) set('required', body.required === true)
  if (body?.order_index !== undefined && Number.isFinite(Number(body.order_index))) set('order_index', Number(body.order_index))
  if (body?.archived !== undefined) set('archived_at', body.archived ? new Date().toISOString() : null)
  if (body?.options !== undefined) {
    if (!['dropdown', 'labels'].includes(field.field_type)) {
      throw createError({ statusCode: 400, statusMessage: 'Only dropdown/labels fields have options' })
    }
    const options = normalizeOptions(body.options, field.options || [])
    if (!options.length) throw createError({ statusCode: 400, statusMessage: 'At least one option is required' })
    set('options', JSON.stringify(options))
  }
  if (!sets.length) return { id: fieldId, version: field.version }

  params.push(user.username)
  sets.push(`updated_by = $${params.length}`, 'updated_at = now()', 'version = version + 1')
  params.push(fieldId)
  const updated = await db.query(`UPDATE work.custom_fields SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING version`, params)
  return { id: fieldId, version: updated.rows[0].version }
})
