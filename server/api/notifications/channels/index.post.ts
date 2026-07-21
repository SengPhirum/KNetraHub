import { requireNotificationScope } from '~~/server/utils/notifyAuth'
import { createChannel } from '~~/server/utils/notifyStore'
import { audit } from '~~/server/utils/store'
import { NOTIFICATION_CHANNEL_TYPES, CHANNEL_TYPE_META, type NotificationChannelType } from '~~/shared/utils/notifications'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const name = String(body?.name ?? '').trim()
  const type = String(body?.type ?? '')
  const scope = String(body?.scope ?? 'global') || 'global'
  const enabled = body?.enabled !== false
  const config = (body?.config && typeof body.config === 'object') ? body.config : {}
  const user = await requireNotificationScope(event, scope)

  if (!name) throw createError({ statusCode: 400, statusMessage: 'Channel name is required' })
  if (!NOTIFICATION_CHANNEL_TYPES.includes(type as NotificationChannelType)) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown channel type' })
  }
  for (const f of CHANNEL_TYPE_META[type as NotificationChannelType].fields) {
    if (f.required && !String(config[f.key] ?? '').trim()) {
      throw createError({ statusCode: 400, statusMessage: `${f.label} is required` })
    }
  }

  const channel = await createChannel({ name, type, scope, enabled, config })
  await audit({ actor: user.username, action: 'notification.channel.create', target: `${name} (${type})` })
  return channel
})
