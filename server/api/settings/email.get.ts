import { requireRole } from '~~/server/utils/auth'
import { getEmailSettings, hasEmailOverride } from '~~/server/utils/emailSettings'

/**
 * Admin-only: the SMTP transport configuration. The password is never sent to
 * the browser - the form shows a "saved" state via `passwordSet` and leaving
 * the field blank on save keeps the stored value.
 */
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin')
  const [settings, overridden] = await Promise.all([getEmailSettings(), hasEmailOverride()])
  const { password, ...safe } = settings
  return { ...safe, passwordSet: Boolean(password), overridden }
})
