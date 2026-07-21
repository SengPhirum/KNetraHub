import { requireRole } from '~~/server/utils/auth'
import { createTemplate } from '~~/server/utils/notifyStore'
import { audit } from '~~/server/utils/store'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const body = await readBody(event)
  const name = String(body?.name ?? '').trim()
  const title = String(body?.title ?? '').trim()
  const templateBody = String(body?.body ?? '')
  const scope = String(body?.scope ?? 'global') || 'global'

  if (!name) throw createError({ statusCode: 400, statusMessage: 'Template name is required' })
  if (!title) throw createError({ statusCode: 400, statusMessage: 'A title is required' })

  const template = await createTemplate({ name, scope, title, body: templateBody })
  await audit({ actor: user.username, action: 'notification.template.create', target: name })
  return template
})
