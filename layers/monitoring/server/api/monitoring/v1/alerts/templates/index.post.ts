import { requireMonitoring } from '../../../../../utils/monitoringAuth'
import { monDb, auditMonitoring, badRequest, conflict } from '../../../../../utils/monApi'

/** POST /api/monitoring/v1/alerts/templates — create a template (admin). */
export default defineEventHandler(async (event) => {
  const user = await requireMonitoring(event, 'admin')
  const db = await monDb()
  const body = await readBody(event)

  const name = String(body?.name ?? '').trim()
  if (!name) badRequest('name is required')
  const title = String(body?.title_template ?? '').trim()
  const bodyTpl = String(body?.body_template ?? '').trim()
  if (!title || !bodyTpl) badRequest('title_template and body_template are required')

  try {
    if (body?.is_default) {
      await db.query(`UPDATE monitoring.alert_templates SET is_default = false WHERE is_default`)
    }
    const res = await db.query(
      `INSERT INTO monitoring.alert_templates (name, title_template, body_template, is_default)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [name, title, bodyTpl, !!body?.is_default]
    )
    await auditMonitoring(user.username, 'template.create', String(res.rows[0].id), `name=${name}`)
    setResponseStatus(event, 201)
    return { id: Number(res.rows[0].id) }
  } catch (err: any) {
    if (err?.code === '23505') conflict(`a template named "${name}" already exists`)
    throw err
  }
})
