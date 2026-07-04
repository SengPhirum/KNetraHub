import { requireIpam } from '../../utils/ipamStore'
import { getAppSetting } from '../../utils/store'

export const IPMGT_SETTINGS_KEY = 'ipmgt_settings'
export const IPMGT_SETTINGS_DEFAULTS = {
  defaultSectionId: null as string | null,
  scanMethod: 'ping' as 'ping' | 'fping' | 'none',
  scanEnabled: false,
  requestsEnabled: true,
  dnsEnabled: false,
  dnsProvider: 'manual' as 'manual' | 'powerdns' | 'other',
  defaultIpStatus: 'used' as string,
  usageWarningThreshold: 80,
  notificationsEnabled: false
}

// Read IPAM settings (merged with defaults). Any signed-in IPAM viewer may read
// them (the UI needs the threshold etc.); only admins can change them (PUT).
export default defineEventHandler(async (event) => {
  await requireIpam(event, 'viewer')
  const raw = await getAppSetting(IPMGT_SETTINGS_KEY)
  let stored: Record<string, unknown> = {}
  if (raw) { try { stored = JSON.parse(raw) } catch { stored = {} } }
  return { ...IPMGT_SETTINGS_DEFAULTS, ...stored }
})
