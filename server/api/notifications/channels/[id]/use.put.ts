import { requireNotificationScope } from '~~/server/utils/notifyAuth'
import { getChannelWithConfig, setChannelApp } from '~~/server/utils/notifyStore'
import { audit } from '~~/server/utils/store'

/**
 * Opt an app in or out of a shared (Global) channel. Body: { app, use }.
 * Only Global channels are selectable - an app-scoped channel is always used by
 * its own app. Requires manager+ on the target app.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const app = String(body?.app ?? '')
  const use = body?.use === true
  if (!app || app === 'global') throw createError({ statusCode: 400, statusMessage: 'An app scope is required' })

  const user = await requireNotificationScope(event, app)
  const channel = await getChannelWithConfig(id)
  if (!channel) throw createError({ statusCode: 404, statusMessage: 'Channel not found' })
  if (channel.scope !== 'global') throw createError({ statusCode: 400, statusMessage: 'Only Global channels can be selected per app' })

  await setChannelApp(id, app, use)
  await audit({ actor: user.username, action: use ? 'notification.channel.use' : 'notification.channel.unuse', target: `${channel.name} → ${app}` })
  return { id, app, selected: use }
})
