import { requireRole } from '~~/server/utils/auth'
import { resetAppearanceSettings } from '~~/server/utils/appearanceSettings'
import { audit } from '~~/server/utils/store'

/** Remove the DB override; appearance follows built-in defaults again. */
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  await resetAppearanceSettings()
  await audit({ actor: user.username, action: 'settings.appearance.reset', target: 'appearance', detail: 'reverted to defaults' })
  return { ok: true }
})
