import { createHash } from 'node:crypto'
import { Resvg } from '@resvg/resvg-js'
import { generateBrandIconSvg } from '../../shared/utils/brandIcon'
import { ENV_MODE_META, type EnvMode } from '../../shared/utils/envMode'

/**
 * Renders the app icon/favicon with the environment corner tag ("Dev" /
 * "Test" / "STG") as a diagonal ribbon across the top-right - used for the
 * favicon, apple-touch icon, and PWA manifest icons whenever the resolved
 * environment mode is not production (see envModeState.ts).
 *
 * The ribbon letters are hand-drawn vector stroke paths, NOT SVG <text>:
 * resvg falls back to no glyphs at all when the runtime has no system fonts,
 * which is exactly the situation inside the app's Alpine-based Docker image.
 * Only the letters D, E, V, T, S, G are needed (DEV / TEST / STG).
 */

/** Skeleton letterforms on a 10-wide x 14-high grid, stroked round. */
const LETTER_PATHS: Record<string, string> = {
  D: 'M2 1 L2 13 L4.5 13 C8.6 12.4 8.6 1.6 4.5 1 Z',
  E: 'M8 1 L2 1 L2 13 L8 13 M2 7 L6.5 7',
  V: 'M1 1 L5 13 L9 1',
  T: 'M1 1 L9 1 M5 1 L5 13',
  S: 'M8 3.2 C7.6 0.7 2.6 0.5 2.2 3.3 C1.8 6.4 8.1 6.7 8 10.4 C7.9 13.4 2.4 13.5 2 10.8',
  G: 'M8.4 3.4 C7.4 0.5 2.2 0.7 2 7 C2.2 13.3 7.6 13.5 8.4 10.6 L8.4 7.6 L5.6 7.6'
}

/**
 * Diagonal top-right corner ribbon carrying `label` (uppercased), sized
 * relative to `size`. `inset` (0..0.2) pulls the ribbon toward the center -
 * used for maskable PWA icons whose corners get cropped by round masks.
 */
export function buildEnvRibbonSvgFragment(size: number, label: string, color: string, inset = 0): string {
  const cx = (0.72 - inset) * size
  const cy = (0.28 + inset) * size
  const bandH = 0.2 * size
  const f = (bandH * 0.6) / 14 // letter grid (14 tall) -> pixels
  const advance = 11.5 * f
  const letters = label.toUpperCase().split('').filter((ch) => LETTER_PATHS[ch])
  const totalW = letters.length ? (letters.length - 1) * advance + 10 * f : 0
  const glyphs = letters
    .map((ch, i) => `<g transform="translate(${(-totalW / 2 + i * advance).toFixed(2)} ${(-7 * f).toFixed(2)}) scale(${f.toFixed(4)})"><path d="${LETTER_PATHS[ch]}" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></g>`)
    .join('')
  return `<g clip-path="url(#envclip)">
  <g transform="translate(${cx.toFixed(2)} ${cy.toFixed(2)}) rotate(45)">
    <rect x="${(-0.75 * size).toFixed(2)}" y="${(-bandH / 2).toFixed(2)}" width="${(1.5 * size).toFixed(2)}" height="${bandH.toFixed(2)}" fill="${color}"/>
    ${glyphs}
  </g>
</g>`
}

function escapeXmlAttr(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Full badged-icon SVG. Base image precedence: an admin-uploaded/generated
 * data-URI icon if given, else the built-in brand mark tinted to
 * `primaryColor`. The ribbon color (`badgeColor`) is a single admin-set
 * value (default red) - the mode is conveyed by the label text, not the color.
 */
export function buildEnvBadgedIconSvg(opts: {
  size: number
  mode: EnvMode
  primaryColor: string
  badgeColor: string
  baseDataUrl?: string
  maskableInset?: number
}): string {
  const { size, mode } = opts
  const meta = ENV_MODE_META[mode]
  const base = opts.baseDataUrl && opts.baseDataUrl.startsWith('data:image/')
    ? `<image x="0" y="0" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet" href="${escapeXmlAttr(opts.baseDataUrl)}"/>`
    : generateBrandIconSvg(opts.primaryColor).replace('<svg xmlns="http://www.w3.org/2000/svg"', `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"`)
  const ribbon = meta.label ? buildEnvRibbonSvgFragment(size, meta.label, opts.badgeColor, opts.maskableInset || 0) : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<defs><clipPath id="envclip"><rect x="0" y="0" width="${size}" height="${size}" rx="${(size * 0.1).toFixed(2)}"/></clipPath></defs>
${base}
${ribbon}
</svg>`
}

const pngCache = new Map<string, Buffer>()

/** Rasterize a badged icon to PNG (cached per mode/size/base/color). */
export function renderEnvBadgedIconPng(opts: {
  size: number
  mode: EnvMode
  primaryColor: string
  badgeColor: string
  baseDataUrl?: string
  maskableInset?: number
}): Buffer {
  const key = createHash('md5')
    .update([opts.mode, opts.size, opts.maskableInset || 0, opts.primaryColor, opts.badgeColor, opts.baseDataUrl || ''].join('|'))
    .digest('hex')
  const cached = pngCache.get(key)
  if (cached) return cached

  let png: Buffer
  try {
    png = Buffer.from(new Resvg(buildEnvBadgedIconSvg(opts), { fitTo: { mode: 'width', value: opts.size } }).render().asPng())
  } catch {
    // Un-rasterizable base upload (e.g. webp, or an http URL resvg can't
    // fetch): fall back to the built-in brand mark so the badge still ships.
    png = Buffer.from(new Resvg(buildEnvBadgedIconSvg({ ...opts, baseDataUrl: undefined }), { fitTo: { mode: 'width', value: opts.size } }).render().asPng())
  }
  if (pngCache.size > 64) pngCache.clear()
  pngCache.set(key, png)
  return png
}
