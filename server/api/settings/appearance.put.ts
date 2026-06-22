import { requireRole } from '~~/server/utils/auth'
import { saveAppearanceSettings } from '~~/server/utils/appearanceSettings'
import type { AppearanceSettings } from '~~/server/utils/appearanceSettings'
import { audit } from '~~/server/utils/store'

const FIELDS: (keyof AppearanceSettings)[] = ['appName', 'primaryColor', 'logoHorizontalUrl', 'logoIconUrl']
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/
// data: URLs (uploaded logos) or plain http(s) URLs only - logos are stored
// inline as base64 in the JSON blob, so cap well under the column's
// practical limit to keep app_settings from growing unbounded.
const MAX_LOGO_LENGTH = 2_000_000

function isValidLogoValue(v: string): boolean {
  if (!v) return true
  if (v.length > MAX_LOGO_LENGTH) return false
  return v.startsWith('data:image/') || v.startsWith('http://') || v.startsWith('https://')
}

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const body = await readBody<Partial<Record<string, unknown>>>(event)

  const patch: Partial<AppearanceSettings> = {}
  for (const field of FIELDS) {
    const v = body[field]
    if (v === undefined) continue
    if (typeof v !== 'string') {
      throw createError({ statusCode: 400, statusMessage: `"${field}" must be a string` })
    }
    patch[field] = v.trim()
  }

  if (patch.appName !== undefined && !patch.appName) {
    throw createError({ statusCode: 400, statusMessage: 'App name cannot be empty' })
  }
  if (patch.primaryColor !== undefined && !HEX_COLOR.test(patch.primaryColor)) {
    throw createError({ statusCode: 400, statusMessage: 'Primary color must be a hex value like #2496ED' })
  }
  if (patch.logoHorizontalUrl !== undefined && !isValidLogoValue(patch.logoHorizontalUrl)) {
    throw createError({ statusCode: 400, statusMessage: 'Horizontal logo must be an http(s) URL or an uploaded image' })
  }
  if (patch.logoIconUrl !== undefined && !isValidLogoValue(patch.logoIconUrl)) {
    throw createError({ statusCode: 400, statusMessage: 'Icon logo must be an http(s) URL or an uploaded image' })
  }

  const next = await saveAppearanceSettings(patch, user.username)
  await audit({ actor: user.username, action: 'settings.appearance.update', target: 'appearance' })
  return next
})
