import { requireNotificationScope } from '~~/server/utils/notifyAuth'
import { getChannelWithConfig, deleteChannel } from '~~/server/utils/notifyStore'
import { audit } from '~~/server/utils/store'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const existing = await getChannelWithConfig(id)
  const user = await requireNotificationScope(event, existing?.scope ?? 'global')
  await deleteChannel(id)
  await audit({ actor: user.username, action: 'notification.channel.delete', target: existing?.name || id })
  return { ok: true }
})
