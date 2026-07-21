import { requireRole } from '~~/server/utils/auth'
import { updateChannel } from '~~/server/utils/notifyStore'
import { audit } from '~~/server/utils/store'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const patch: Record<string, any> = {}
  if (typeof body?.name === 'string') patch.name = body.name.trim()
  if (typeof body?.scope === 'string') patch.scope = body.scope
  if (typeof body?.enabled === 'boolean') patch.enabled = body.enabled
  if (body?.config && typeof body.config === 'object') patch.config = body.config

  const channel = await updateChannel(id, patch)
  await audit({ actor: user.username, action: 'notification.channel.update', target: channel.name })
  return channel
})
