/**
 * Renders the built-in KNetraHub icon mark (see app/components/KNetraHubLogo.vue's
 * "icon" variant) as a standalone, tinted SVG string - the auto-generated
 * favicon/PWA-icon fallback used when an admin customizes Appearance's primary
 * color without uploading their own favicon/PWA icon. Kept as plain SVG (no
 * server-side rasterization dependency) - works as a <link rel="icon">,
 * apple-touch-icon, and Web App Manifest icon in Chromium/Firefox/Android;
 * iOS Safari doesn't support SVG apple-touch-icons and falls back to its own
 * default there unless the admin uploads a real image.
 */

/** Parses a #rrggbb hex color into 0-255 RGB channels; falls back to the
 *  built-in brand blue for anything that isn't a valid 6-digit hex. */
function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return [36, 150, 237]
  const n = parseInt(m[1]!, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  return '#' + [r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('')
}

/** Darkens a hex color by a uniform factor - matches the built-in icon's
 *  default gradient (#2496ED -> #155e9c is roughly a 0.62x darken). */
function darken(hex: string, factor = 0.62): string {
  const [r, g, b] = hexToRgb(hex)
  return rgbToHex(r * factor, g * factor, b * factor)
}

export function generateBrandIconSvg(primaryColor: string): string {
  const dark = darken(primaryColor)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="kn" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${primaryColor}"/>
      <stop offset="1" stop-color="${dark}"/>
    </linearGradient>
  </defs>
  <rect x="16" y="16" width="480" height="480" rx="116" fill="url(#kn)"/>
  <g fill="none" stroke="#fff" stroke-width="14" stroke-linecap="round">
    <line x1="440" y1="286" x2="348" y2="126.7"/>
    <line x1="348" y1="126.7" x2="164" y2="126.7"/>
    <line x1="164" y1="126.7" x2="72" y2="286"/>
    <line x1="72" y1="286" x2="164" y2="445.3"/>
    <line x1="164" y1="445.3" x2="348" y2="445.3"/>
    <line x1="348" y1="445.3" x2="440" y2="286"/>
  </g>
  <g fill="#fff">
    <circle cx="440" cy="286" r="22"/><circle cx="348" cy="126.7" r="22"/><circle cx="164" cy="126.7" r="22"/>
    <circle cx="72" cy="286" r="22"/><circle cx="164" cy="445.3" r="22"/><circle cx="348" cy="445.3" r="22"/>
    <rect x="232" y="98" width="48" height="11" rx="4"/>
    <path d="M236 98 C 240 86 272 86 276 98 Z"/>
    <path d="M238 90 C 224 84 222 70 230 60 C 234 74 240 80 246 86 Z"/>
    <path d="M274 90 C 288 84 290 70 282 60 C 278 74 272 80 266 86 Z"/>
    <path d="M256 38 C 244 60 240 78 248 90 C 252 96 260 96 264 90 C 272 78 268 60 256 38 Z"/>
  </g>
  <path d="M150 292 C 198 230 314 230 362 292 C 314 354 198 354 150 292 Z" fill="none" stroke="#fff" stroke-width="15" stroke-linejoin="round"/>
  <circle cx="256" cy="292" r="48" fill="none" stroke="#fff" stroke-width="8" stroke-dasharray="30 15"/>
  <circle cx="256" cy="292" r="29" fill="#fff"/>
  <circle cx="256" cy="292" r="14" fill="#1d72bd"/>
  <circle cx="245" cy="281" r="5" fill="#fff"/>
</svg>`
}

/** Data-URI-encodes an SVG string for direct use as an <img>/<link href>/manifest icon src. */
export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
