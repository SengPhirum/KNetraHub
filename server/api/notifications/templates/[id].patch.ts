import { requireRole } from '~~/server/utils/auth'
import { updateTemplate } from '~~/server/utils/notifyStore'
import { audit } from '~~/server/utils/store'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const patch: Record<string, any> = {}
  if (typeof body?.name === 'string') patch.name = body.name.trim()
  if (typeof body?.scope === 'string') patch.scope = body.scope
  if (typeof body?.title === 'string') patch.title = body.title.trim()
  if (typeof body?.body === 'string') patch.body = body.body

  const template = await updateTemplate(id, patch)
  await audit({ actor: user.username, action: 'notification.template.update', target: template.name })
  return template
})
