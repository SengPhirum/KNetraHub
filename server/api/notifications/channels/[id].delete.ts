import { requireRole } from '~~/server/utils/auth'
import { getChannelWithConfig, deleteChannel } from '~~/server/utils/notifyStore'
import { audit } from '~~/server/utils/store'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const id = getRouterParam(event, 'id')!
  const existing = await getChannelWithConfig(id)
  await deleteChannel(id)
  await audit({ actor: user.username, action: 'notification.channel.delete', target: existing?.name || id })
  return { ok: true }
})
