import { requireRole } from '~~/server/utils/auth'
import { resetEmailSettings, getEmailSettings } from '~~/server/utils/emailSettings'
import { audit } from '~~/server/utils/store'

/** Drop the DB override so email follows the NUXT_SMTP_* environment again. */
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  await resetEmailSettings()
  await audit({ actor: user.username, action: 'settings.email.reset', target: 'email' })
  const settings = await getEmailSettings()
  const { password, ...safe } = settings
  return { ...safe, passwordSet: Boolean(password), overridden: false }
})
