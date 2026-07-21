import { requireNotificationScope } from '~~/server/utils/notifyAuth'
import { getChannelWithConfig, updateChannel } from '~~/server/utils/notifyStore'
import { audit } from '~~/server/utils/store'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const existing = await getChannelWithConfig(id)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Channel not found' })
  const user = await requireNotificationScope(event, existing.scope)
  const body = await readBody(event)
  const patch: Record<string, any> = {}
  if (typeof body?.name === 'string') patch.name = body.name.trim()
  if (typeof body?.scope === 'string') patch.scope = body.scope
  if (typeof body?.enabled === 'boolean') patch.enabled = body.enabled
  if (body?.config && typeof body.config === 'object') patch.config = body.config
  // Moving a record to another scope needs rights on the target scope too.
  if (patch.scope && patch.scope !== existing.scope) await requireNotificationScope(event, patch.scope)

  const channel = await updateChannel(id, patch)
  await audit({ actor: user.username, action: 'notification.channel.update', target: channel.name })
  return channel
})
