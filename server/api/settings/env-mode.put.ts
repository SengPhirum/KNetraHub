import { requireRole } from '~~/server/utils/auth'
import { getEnvModeState, setAdminEnvMode } from '~~/server/utils/envModeState'
import { normalizeEnvMode } from '~~/shared/utils/envMode'
import { audit } from '~~/server/utils/store'

// Set (or clear, with mode: '') the admin environment-mode override.
// Rejected outright when the mode is fixed via NUXT_ENV_MODE from the
// compose file - that configuration deliberately cannot be undone from the UI.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const current = await getEnvModeState(event)
  if (current.locked) {
    throw createError({ statusCode: 409, statusMessage: 'Environment mode is fixed by NUXT_ENV_MODE in the deployment configuration and cannot be changed here' })
  }

  const body = await readBody<{ mode?: unknown }>(event)
  const raw = String(body?.mode ?? '').trim()
  const mode = normalizeEnvMode(raw)
  if (raw && !mode) {
    throw createError({ statusCode: 400, statusMessage: 'mode must be one of production, staging, development, testing - or empty for auto-detection' })
  }

  await setAdminEnvMode(mode, user.username)
  await audit({ actor: user.username, action: 'settings.envmode.update', target: mode || 'auto' })
  return await getEnvModeState(event)
})
