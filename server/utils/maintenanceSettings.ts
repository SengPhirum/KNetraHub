import { getAppSetting, setAppSetting } from './store'

/**
 * System maintenance settings (Admin > System > Maintenance), stored as one
 * JSON blob in app_settings. Two independent switches:
 *  - banner: a dismissible heads-up notice shown to every signed-in user;
 *    never blocks access.
 *  - maintenance: full lockout — while enabled only admins can use the app,
 *    every other role sees the maintenance page (client) and gets 503 from
 *    the API (server/middleware/maintenance.ts).
 */
export interface MaintenanceSettings {
  banner: {
    enabled: boolean
    message: string
  }
  maintenance: {
    enabled: boolean
    title: string
    subtitle: string
    description: string
  }
}

const KEY = 'system_maintenance'

export const MAINTENANCE_DEFAULTS: MaintenanceSettings = {
  banner: { enabled: false, message: '' },
  maintenance: { enabled: false, title: '', subtitle: '', description: '' }
}

export async function getMaintenanceSettings(): Promise<MaintenanceSettings> {
  const raw = await getAppSetting(KEY)
  if (!raw) return structuredClone(MAINTENANCE_DEFAULTS)
  try {
    const parsed = JSON.parse(raw)
    return {
      banner: {
        enabled: parsed?.banner?.enabled === true,
        message: typeof parsed?.banner?.message === 'string' ? parsed.banner.message : ''
      },
      maintenance: {
        enabled: parsed?.maintenance?.enabled === true,
        title: typeof parsed?.maintenance?.title === 'string' ? parsed.maintenance.title : '',
        subtitle: typeof parsed?.maintenance?.subtitle === 'string' ? parsed.maintenance.subtitle : '',
        description: typeof parsed?.maintenance?.description === 'string' ? parsed.maintenance.description : ''
      }
    }
  } catch {
    return structuredClone(MAINTENANCE_DEFAULTS)
  }
}

export async function saveMaintenanceSettings(
  patch: Partial<MaintenanceSettings>,
  actor: string
): Promise<MaintenanceSettings> {
  const current = await getMaintenanceSettings()
  const next: MaintenanceSettings = {
    banner: { ...current.banner, ...(patch.banner ?? {}) },
    maintenance: { ...current.maintenance, ...(patch.maintenance ?? {}) }
  }
  await setAppSetting(KEY, JSON.stringify(next), actor)
  return next
}
