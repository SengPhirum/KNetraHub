import { requirePamPermission, setPamSetting, pamAudit } from '~~/layers/pam/server/utils/pamStore'

/** Update PAM settings from a partial key→value map (pam.settings permission). */
export default defineEventHandler(async (event) => {
  const { user } = await requirePamPermission(event, 'pam.settings')
  const body = await readBody(event)
  const updates = body?.settings && typeof body.settings === 'object' ? body.settings : body
  if (!updates || typeof updates !== 'object') throw createError({ statusCode: 400, statusMessage: 'A settings object is required' })
  const keys = Object.keys(updates)
  // Guard against writing giant/unknown blobs — settings are small config values.
  if (keys.length > 100) throw createError({ statusCode: 400, statusMessage: 'Too many settings in one request' })
  for (const key of keys) {
    await setPamSetting(key, updates[key], user.username)
  }
  await pamAudit(event, user, { action: 'settings.update', objectType: 'settings', severity: 'notice', details: { keys } })
  return { ok: true, updated: keys.length }
})
