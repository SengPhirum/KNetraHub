import { requireRole } from '~~/server/utils/auth'
import { getTemplate, deleteTemplate } from '~~/server/utils/notifyStore'
import { audit } from '~~/server/utils/store'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const id = getRouterParam(event, 'id')!
  const existing = await getTemplate(id)
  await deleteTemplate(id)
  await audit({ actor: user.username, action: 'notification.template.delete', target: existing?.name || id })
  return { ok: true }
})
