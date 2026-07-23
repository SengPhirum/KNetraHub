import {
  getWork, newId, optionalText, requireText, requireWork, workAudit
} from '~~/layers/work/server/utils/workStore'
import { assertFolderAccess, assertListAccess, assertSpaceAccess } from '~~/layers/work/server/utils/workAccess'
import { FIELD_TYPES, normalizeOptions } from '~~/layers/work/server/utils/workFields'

/**
 * Create a custom field definition. Location-scoped fields need manager tier
 * plus edit access to the location; workspace-wide fields need admin tier.
 */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWork(event, 'manager')
  const body = await readBody(event)

  const scopeType = String(body?.scope_type || 'workspace')
  if (!['workspace', 'space', 'folder', 'list'].includes(scopeType)) {
    throw createError({ statusCode: 400, statusMessage: 'scope_type must be workspace, space, folder, or list' })
  }
  let scopeId: string | null = null
  if (scopeType === 'workspace') {
    if (tier !== 'admin') throw createError({ statusCode: 403, statusMessage: 'Workspace-wide fields require admin access to Work' })
  } else {
    scopeId = String(body?.scope_id || '')
    if (!scopeId) throw createError({ statusCode: 400, statusMessage: 'scope_id is required for location-scoped fields' })
    if (scopeType === 'space') await assertSpaceAccess(user, tier, workspaceId, scopeId, 'edit')
    if (scopeType === 'folder') await assertFolderAccess(user, tier, workspaceId, scopeId, 'edit')
    if (scopeType === 'list') await assertListAccess(user, tier, workspaceId, scopeId, 'edit')
  }

  const name = requireText(body?.name, 'Field name', 100)
  const fieldType = String(body?.field_type || '')
  if (!(FIELD_TYPES as readonly string[]).includes(fieldType)) {
    throw createError({ statusCode: 400, statusMessage: `field_type must be one of: ${FIELD_TYPES.join(', ')}` })
  }
  const options = ['dropdown', 'labels'].includes(fieldType) ? normalizeOptions(body?.options) : []
  if (['dropdown', 'labels'].includes(fieldType) && !options.length) {
    throw createError({ statusCode: 400, statusMessage: `A ${fieldType} field needs at least one option` })
  }

  const config: Record<string, unknown> = {}
  if (fieldType === 'currency') config.currency = /^[A-Z]{3}$/.test(String(body?.config?.currency || '')) ? String(body.config.currency) : 'USD'
  if (fieldType === 'rating') {
    const max = Number(body?.config?.max || 5)
    config.max = Number.isInteger(max) && max >= 1 && max <= 10 ? max : 5
  }

  const db = getWork()
  const dup = await db.query(
    `SELECT 1 FROM work.custom_fields
      WHERE workspace_id = $1 AND scope_type = $2 AND scope_id IS NOT DISTINCT FROM $3
        AND lower(name) = lower($4) AND archived_at IS NULL`,
    [workspaceId, scopeType, scopeId, name])
  if (dup.rows.length) throw createError({ statusCode: 409, statusMessage: `A field named "${name}" already exists at this scope` })

  const id = newId()
  await db.query(
    `INSERT INTO work.custom_fields
       (id, workspace_id, scope_type, scope_id, name, field_type, description, required, config, options, order_index, created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)`,
    [id, workspaceId, scopeType, scopeId, name, fieldType,
      optionalText(body?.description, 'Description', 500), body?.required === true,
      JSON.stringify(config), JSON.stringify(options), Date.now(), user.username])
  await workAudit(user, 'custom_field.created', id, `${name} (${fieldType}, ${scopeType})`)
  return { id }
})
