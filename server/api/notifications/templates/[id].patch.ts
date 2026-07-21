import { requireNotificationScope } from '~~/server/utils/notifyAuth'
import { getTemplate, updateTemplate } from '~~/server/utils/notifyStore'
import { audit } from '~~/server/utils/store'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const existing = await getTemplate(id)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Template not found' })
  const user = await requireNotificationScope(event, existing.scope)
  const body = await readBody(event)
  const patch: Record<string, any> = {}
  if (typeof body?.name === 'string') patch.name = body.name.trim()
  if (typeof body?.scope === 'string') patch.scope = body.scope
  if (typeof body?.title === 'string') patch.title = body.title.trim()
  if (typeof body?.body === 'string') patch.body = body.body
  if (patch.scope && patch.scope !== existing.scope) await requireNotificationScope(event, patch.scope)

  const template = await updateTemplate(id, patch)
  await audit({ actor: user.username, action: 'notification.template.update', target: template.name })
  return template
})
