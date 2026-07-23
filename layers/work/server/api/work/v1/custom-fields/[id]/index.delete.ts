import { getWork, requireWorkPermission, workAudit } from '~~/layers/work/server/utils/workStore'

/** Permanently delete a field definition and all its stored values (admin). */
export default defineEventHandler(async (event) => {
  const { user, workspaceId } = await requireWorkPermission(event, 'work.delete')
  const fieldId = String(getRouterParam(event, 'id'))
  const db = getWork()
  const { rows } = await db.query('SELECT * FROM work.custom_fields WHERE id = $1 AND workspace_id = $2', [fieldId, workspaceId])
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Custom field not found' })
  const values = await db.query('SELECT count(*)::int AS n FROM work.custom_field_values WHERE field_id = $1', [fieldId])
  await db.query('DELETE FROM work.custom_fields WHERE id = $1', [fieldId])
  await workAudit(user, 'custom_field.deleted', fieldId, `${rows[0].name} (${values.rows[0].n} stored value(s) removed)`)
  return { deleted: true, values_removed: values.rows[0].n }
})
