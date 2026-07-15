import { getAppearanceSettings } from '~~/server/utils/appearanceSettings'

/**
 * Generated per-request (same reasoning as manifest.webmanifest.get.ts) so an
 * admin's Appearance override (primary color, uploaded PWA icon) reaches
 * Windows' tile-pinning config too - this route takes precedence over the
 * static public/browserconfig.xml, which previously always served the
 * hardcoded default color/icons no matter what was configured. The static
 * file is kept as-is for the docs build, which has no server to generate
 * this dynamically.
 */
export default defineEventHandler(async (event) => {
  const appearance = await getAppearanceSettings()
  const smallIcon = appearance.pwaIconUrl || '/icons/icon-150x150.png'
  const largeIcon = appearance.pwaIconUrl || '/icons/icon-310x310.png'

  setResponseHeader(event, 'content-type', 'application/xml')

  return `<?xml version="1.0" encoding="utf-8"?>
<browserconfig>
  <msapplication>
    <tile>
      <square150x150logo src="${smallIcon}"/>
      <square310x310logo src="${largeIcon}"/>
      <TileColor>${appearance.primaryColor}</TileColor>
    </tile>
  </msapplication>
</browserconfig>
`
})
