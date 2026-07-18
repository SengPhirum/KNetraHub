import { requireMonitoring } from '../../../../../../utils/monitoringAuth'
import { monDb, idParam, auditMonitoring, badRequest, conflict, notFound } from '../../../../../../utils/monApi'

/** PUT /api/monitoring/v1/alerts/templates/:id — update a template (admin). */
export default defineEventHandler(async (event) => {
  const user = await requireMonitoring(event, 'admin')
  const db = await monDb()
  const id = idParam(event)
  const body = await readBody(event)

  const sets: string[] = []
  const args: unknown[] = [id]
  const set = (col: string, value: unknown) => {
    args.push(value)
    sets.push(`${col} = $${args.length}`)
  }

  if (body?.name !== undefined) {
    const name = String(body.name ?? '').trim()
    if (!name) badRequest('name cannot be empty')
    set('name', name)
  }
  if (body?.title_template !== undefined) {
    const title = String(body.title_template ?? '').trim()
    if (!title) badRequest('title_template cannot be empty')
    set('title_template', title)
  }
  if (body?.body_template !== undefined) {
    const bodyTpl = String(body.body_template ?? '').trim()
    if (!bodyTpl) badRequest('body_template cannot be empty')
    set('body_template', bodyTpl)
  }
  if (body?.is_default !== undefined) {
    if (body.is_default) await db.query(`UPDATE monitoring.alert_templates SET is_default = false WHERE is_default AND id <> $1`, [id])
    set('is_default', !!body.is_default)
  }
  if (!sets.length) badRequest('nothing to update')
  set('updated_at', new Date())

  try {
    const res = await db.query(`UPDATE monitoring.alert_templates SET ${sets.join(', ')} WHERE id = $1 RETURNING id`, args)
    if (!res.rowCount) notFound('alert template')
  } catch (err: any) {
    if (err?.code === '23505') conflict('a template with that name already exists')
    throw err
  }
  await auditMonitoring(user.username, 'template.update', String(id))
  return { id, updated: true }
})
