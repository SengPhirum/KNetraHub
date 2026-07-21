import { requireNotificationScope } from '~~/server/utils/notifyAuth'
import { getTemplate, deleteTemplate } from '~~/server/utils/notifyStore'
import { audit } from '~~/server/utils/store'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const existing = await getTemplate(id)
  const user = await requireNotificationScope(event, existing?.scope ?? 'global')
  await deleteTemplate(id)
  await audit({ actor: user.username, action: 'notification.template.delete', target: existing?.name || id })
  return { ok: true }
})
