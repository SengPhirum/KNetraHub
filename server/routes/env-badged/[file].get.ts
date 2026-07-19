import { getEnvModeState } from '~~/server/utils/envModeState'
import { getAppearanceSettings } from '~~/server/utils/appearanceSettings'
import { buildEnvBadgedIconSvg, renderEnvBadgedIconPng } from '~~/server/utils/envIconBadge'

// Environment-badged icon assets - referenced by app.vue's head links and the
// dynamic manifest whenever the resolved environment mode isn't production.
// Each file is the regular icon (admin-uploaded override or built-in brand
// mark) with the mode's corner ribbon composited on. In production these
// URLs shouldn't be referenced at all; redirect to the plain default asset
// so a stale cached HTML page still gets a sane icon.
const FILES: Record<string, { size: number; base: 'favicon' | 'pwa'; maskableInset?: number; fallback: string }> = {
  'favicon.svg': { size: 64, base: 'favicon', fallback: '/favicon.ico' },
  'favicon-32x32.png': { size: 32, base: 'favicon', fallback: '/favicon-32x32.png' },
  'favicon-16x16.png': { size: 16, base: 'favicon', fallback: '/favicon-16x16.png' },
  'apple-touch-icon.png': { size: 180, base: 'pwa', fallback: '/apple-touch-icon.png' },
  'icon-192x192.png': { size: 192, base: 'pwa', fallback: '/icons/icon-192x192.png' },
  'icon-512x512.png': { size: 512, base: 'pwa', fallback: '/icons/icon-512x512.png' },
  'maskable-icon-512x512.png': { size: 512, base: 'pwa', maskableInset: 0.1, fallback: '/icons/maskable-icon-512x512.png' }
}

export default defineEventHandler(async (event) => {
  const file = getRouterParam(event, 'file') || ''
  const spec = FILES[file]
  if (!spec) throw createError({ statusCode: 404, statusMessage: 'Unknown icon' })

  const state = await getEnvModeState(event)
  if (state.mode === 'production') return sendRedirect(event, spec.fallback, 302)

  const appearance = await getAppearanceSettings()
  const baseUrl = spec.base === 'favicon' ? appearance.faviconUrl : appearance.pwaIconUrl
  const opts = {
    size: spec.size,
    mode: state.mode,
    primaryColor: appearance.primaryColor,
    badgeColor: appearance.envBadgeColor,
    baseDataUrl: baseUrl || undefined,
    maskableInset: spec.maskableInset
  }

  // Short-lived cache: mode/appearance changes should propagate within
  // minutes without a hard refresh, while repeat loads stay cheap.
  setResponseHeader(event, 'cache-control', 'public, max-age=300')
  if (file.endsWith('.svg')) {
    setResponseHeader(event, 'content-type', 'image/svg+xml')
    return buildEnvBadgedIconSvg(opts)
  }
  setResponseHeader(event, 'content-type', 'image/png')
  return renderEnvBadgedIconPng(opts)
})
