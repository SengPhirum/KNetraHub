import { Resvg } from '@resvg/resvg-js'
import { generateBrandIconSvg } from '../../shared/utils/brandIcon'

/**
 * Renders the built-in KNetraHub icon mark, tinted to the given color, as a
 * real PNG data URI at the requested pixel size - used to auto-populate the
 * favicon/PWA icon fields when an admin customizes the primary color without
 * uploading their own image (see appearanceSettings.ts's saveAppearanceSettings).
 * Stored exactly like a real upload, so every platform picks it up correctly -
 * a pure-SVG icon (tried first) isn't accepted by Chrome's PWA install-prompt
 * icon picker, which requires a raster image.
 */
export function renderBrandIconPngDataUrl(color: string, size: number): string {
  const svg = generateBrandIconSvg(color)
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size } })
  const png = resvg.render().asPng()
  return `data:image/png;base64,${png.toString('base64')}`
}
