import { getAppearanceSettings, hasAppearanceOverride, defaultAppearanceSettings } from '~~/server/utils/appearanceSettings'

/** Unauthenticated: the login screen needs branding before anyone signs in. */
export default defineEventHandler(async () => {
  // Static docs build: there is no database - serve the config defaults so
  // prerendering never opens a Postgres pool (and never logs request errors).
  if (useRuntimeConfig().public.staticDocs) {
    return { ...defaultAppearanceSettings(), overridden: false }
  }

  const [settings, overridden] = await Promise.all([
    getAppearanceSettings(),
    hasAppearanceOverride()
  ])
  return { ...settings, overridden }
})
