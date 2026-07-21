import { requireRole } from '~~/server/utils/auth'
import { getChannelWithConfig } from '~~/server/utils/notifyStore'
import { deliverToChannel } from '~~/server/utils/notify'

/** Send a one-off test message to a channel so an admin can confirm delivery
 *  before anything relies on it. Returns the (redacted) delivery result. */
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin')
  const id = getRouterParam(event, 'id')!
  const channel = await getChannelWithConfig(id)
  if (!channel) throw createError({ statusCode: 404, statusMessage: 'Channel not found' })

  const result = await deliverToChannel(channel, {
    title: 'KNetraHub test notification',
    body: `This is a test message to "${channel.name}". If you can read this, delivery is working.`,
    severity: 'info',
    kind: 'test'
  })
  return result
})
