import { getAppearanceSettings, DEFAULT_PRIMARY_COLOR } from '~~/server/utils/appearanceSettings'
import { generateBrandIconSvg, svgToDataUrl } from '~~/shared/utils/brandIcon'

// Default PWA icon set, baked into public/icons/ at build time. Used whenever
// no admin-uploaded PWA icon override is set.
const DEFAULT_ICONS = [
  { src: '/icons/icon-72x72.png', sizes: '72x72', type: 'image/png', purpose: 'any' },
  { src: '/icons/icon-96x96.png', sizes: '96x96', type: 'image/png', purpose: 'any' },
  { src: '/icons/icon-128x128.png', sizes: '128x128', type: 'image/png', purpose: 'any' },
  { src: '/icons/icon-144x144.png', sizes: '144x144', type: 'image/png', purpose: 'any' },
  { src: '/icons/icon-152x152.png', sizes: '152x152', type: 'image/png', purpose: 'any' },
  { src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: '/icons/icon-384x384.png', sizes: '384x384', type: 'image/png', purpose: 'any' },
  { src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: '/icons/maskable-icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
  { src: '/icons/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
]

function mimeFromDataUrl(url: string): string {
  return /^data:([^;,]+)/.exec(url)?.[1] || 'image/png'
}

/**
 * Generated per-request (replaces @vite-pwa/nuxt's build-time static
 * manifest.webmanifest, disabled via `pwa.manifest = false` in
 * nuxt.config.ts) so an admin-uploaded PWA icon takes effect immediately,
 * the same way the other Appearance overrides do - no rebuild needed.
 */
export default defineEventHandler(async (event) => {
  const appearance = await getAppearanceSettings()
  const icon = appearance.pwaIconUrl
  // When no icon is uploaded but the primary color is customized, auto-tint
  // the built-in mark instead of silently keeping the default-blue icons -
  // SVG only (no rasterization dependency), so no "maskable" variant here.
  const autoTinted = !icon && appearance.primaryColor !== DEFAULT_PRIMARY_COLOR
    ? svgToDataUrl(generateBrandIconSvg(appearance.primaryColor))
    : null

  setResponseHeader(event, 'content-type', 'application/manifest+json')

  return {
    name: appearance.appName,
    short_name: appearance.appName,
    description: 'KNetraHub - Docker Swarm and container management dashboard.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#ffffff',
    theme_color: appearance.primaryColor,
    categories: ['developer', 'productivity', 'utilities'],
    icons: icon
      ? [
          { src: icon, sizes: '192x192', type: mimeFromDataUrl(icon), purpose: 'any' },
          { src: icon, sizes: '512x512', type: mimeFromDataUrl(icon), purpose: 'any' },
          { src: icon, sizes: '512x512', type: mimeFromDataUrl(icon), purpose: 'maskable' }
        ]
      : autoTinted
        ? [{ src: autoTinted, sizes: 'any', type: 'image/svg+xml', purpose: 'any' }]
        : DEFAULT_ICONS
  }
})
