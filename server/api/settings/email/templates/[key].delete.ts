import { requireRole } from '~~/server/utils/auth'
import { resetEmailTemplate } from '~~/server/utils/emailSettings'
import { audit } from '~~/server/utils/store'
import type { EmailTemplateKey } from '~~/shared/utils/emailTemplates'

/** Drop one template's override so it follows the built-in default again. */
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const key = getRouterParam(event, 'key') as EmailTemplateKey
  const restored = await resetEmailTemplate(key, user.username)
  await audit({ actor: user.username, action: 'settings.email.template.reset', target: key })
  return restored
})
