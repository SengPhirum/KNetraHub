import { getAppearanceSettings, hasAppearanceOverride } from '~~/server/utils/appearanceSettings'

/** Unauthenticated: the login screen needs branding before anyone signs in. */
export default defineEventHandler(async () => {
  const [settings, overridden] = await Promise.all([
    getAppearanceSettings(),
    hasAppearanceOverride()
  ])
  return { ...settings, overridden }
})
