import { requireIpam, ipamAudit } from '~~/layers/ipmgt/server/utils/ipamStore'
import { getAppSetting, setAppSetting } from '~~/server/utils/store'
import { IPMGT_SETTINGS_KEY, IPMGT_SETTINGS_DEFAULTS } from '~~/layers/ipmgt/server/api/ipmgt/settings.get'

// Update IPAM settings (admin/settings tier). Coerces + clamps known keys.
export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'admin')
  const body = await readBody(event)

  const raw = await getAppSetting(IPMGT_SETTINGS_KEY)
  let cur: Record<string, any> = { ...IPMGT_SETTINGS_DEFAULTS }
  if (raw) { try { cur = { ...cur, ...JSON.parse(raw) } } catch { /* ignore */ } }

  const next = { ...cur }
  if (body.defaultSectionId !== undefined) next.defaultSectionId = body.defaultSectionId || null
  if (body.scanMethod !== undefined) next.scanMethod = ['ping', 'fping', 'none'].includes(body.scanMethod) ? body.scanMethod : cur.scanMethod
  if (body.scanEnabled !== undefined) next.scanEnabled = !!body.scanEnabled
  if (body.requestsEnabled !== undefined) next.requestsEnabled = !!body.requestsEnabled
  if (body.dnsEnabled !== undefined) next.dnsEnabled = !!body.dnsEnabled
  if (body.dnsProvider !== undefined) next.dnsProvider = ['manual', 'powerdns', 'other'].includes(body.dnsProvider) ? body.dnsProvider : cur.dnsProvider
  if (body.defaultIpStatus !== undefined) next.defaultIpStatus = String(body.defaultIpStatus)
  if (body.notificationsEnabled !== undefined) next.notificationsEnabled = !!body.notificationsEnabled
  if (body.usageWarningThreshold !== undefined) {
    const t = Number(body.usageWarningThreshold)
    next.usageWarningThreshold = Number.isFinite(t) ? Math.min(100, Math.max(1, Math.round(t))) : cur.usageWarningThreshold
  }

  await setAppSetting(IPMGT_SETTINGS_KEY, JSON.stringify(next), user.username)
  await ipamAudit(user, 'ipmgt.settings.update', null, next)
  return next
})
