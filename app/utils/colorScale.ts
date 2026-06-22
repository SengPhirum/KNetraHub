/** Tailwind-style 50-950 tint/shade ramp generated from a single brand hex color. */
export type ColorScale = Record<'50' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900' | '950', string>

const LIGHT_WEIGHTS: Record<string, number> = { '50': 0.95, '100': 0.88, '200': 0.72, '300': 0.52, '400': 0.28 }
const DARK_WEIGHTS: Record<string, number> = { '600': 0.16, '700': 0.32, '800': 0.46, '900': 0.58, '950': 0.72 }

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16)
  ]
}

function toHex(n: number): string {
  return Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0')
}

function mix(base: [number, number, number], target: [number, number, number], weight: number): string {
  const r = base[0] + (target[0] - base[0]) * weight
  const g = base[1] + (target[1] - base[1]) * weight
  const b = base[2] + (target[2] - base[2]) * weight
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/** Not a perceptual color space - just a cheap, dependency-free approximation good enough for admin-picked brand colors. */
export function generateColorScale(baseHex: string): ColorScale {
  const base = hexToRgb(baseHex)
  const white: [number, number, number] = [255, 255, 255]
  const black: [number, number, number] = [0, 0, 0]
  const scale = { '500': baseHex.toLowerCase() } as ColorScale
  for (const [step, weight] of Object.entries(LIGHT_WEIGHTS)) scale[step as keyof ColorScale] = mix(base, white, weight)
  for (const [step, weight] of Object.entries(DARK_WEIGHTS)) scale[step as keyof ColorScale] = mix(base, black, weight)
  return scale
}
