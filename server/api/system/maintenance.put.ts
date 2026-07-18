import { requireRole } from '~~/server/utils/auth'
import { saveMaintenanceSettings } from '~~/server/utils/maintenanceSettings'
import type { MaintenanceSettings } from '~~/server/utils/maintenanceSettings'
import { audit } from '~~/server/utils/store'

const MAX_TEXT = 4000

function str(v: unknown, field: string): string {
  if (typeof v !== 'string') throw createError({ statusCode: 400, statusMessage: `"${field}" must be a string` })
  return v.trim().slice(0, MAX_TEXT)
}

/** PUT /api/system/maintenance — update banner and/or maintenance mode (admin). */
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const body = await readBody<Partial<Record<string, any>>>(event)

  const patch: Partial<MaintenanceSettings> = {}
  if (body.banner !== undefined) {
    patch.banner = {
      enabled: body.banner?.enabled === true,
      message: str(body.banner?.message ?? '', 'banner.message')
    }
  }
  if (body.maintenance !== undefined) {
    patch.maintenance = {
      enabled: body.maintenance?.enabled === true,
      title: str(body.maintenance?.title ?? '', 'maintenance.title'),
      subtitle: str(body.maintenance?.subtitle ?? '', 'maintenance.subtitle'),
      description: str(body.maintenance?.description ?? '', 'maintenance.description')
    }
  }
  if (!Object.keys(patch).length) {
    throw createError({ statusCode: 400, statusMessage: 'Nothing to update — pass banner and/or maintenance' })
  }

  const next = await saveMaintenanceSettings(patch, user.username)
  await audit({
    actor: user.username,
    action: 'system.maintenance.update',
    target: 'maintenance',
    detail: `banner=${next.banner.enabled ? 'on' : 'off'} maintenance=${next.maintenance.enabled ? 'on' : 'off'}`
  })
  return next
})
