// Shared Monitoring UI helpers: status metadata, byte/bit formatting, and
// per-app permission shortcuts resolved against the user's monitoring tier.

export interface StatusMeta {
  label: string
  badge: string
  dot: string
}

export const DEVICE_STATUS_META: Record<string, StatusMeta> = {
  up: { label: 'Up', badge: 'bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/30', dot: 'bg-emerald-500' },
  down: { label: 'Down', badge: 'bg-rose-500/10 text-rose-400 ring-1 ring-inset ring-rose-500/30', dot: 'bg-rose-500' },
  degraded: { label: 'Degraded', badge: 'bg-amber-500/10 text-amber-400 ring-1 ring-inset ring-amber-500/30', dot: 'bg-amber-500' },
  disabled: { label: 'Disabled', badge: 'bg-zinc-500/10 text-zinc-400 ring-1 ring-inset ring-zinc-500/30', dot: 'bg-zinc-500' },
  ignored: { label: 'Ignored', badge: 'bg-zinc-500/10 text-zinc-400 ring-1 ring-inset ring-zinc-500/30', dot: 'bg-zinc-400' },
  maintenance: { label: 'Maintenance', badge: 'bg-sky-500/10 text-sky-400 ring-1 ring-inset ring-sky-500/30', dot: 'bg-sky-500' },
  pending: { label: 'Pending', badge: 'bg-violet-500/10 text-violet-400 ring-1 ring-inset ring-violet-500/30', dot: 'bg-violet-500' }
}

export const SENSOR_STATUS_META: Record<string, StatusMeta> = {
  ok: DEVICE_STATUS_META.up!,
  warning: DEVICE_STATUS_META.degraded!,
  critical: DEVICE_STATUS_META.down!,
  unknown: DEVICE_STATUS_META.pending!
}

export const SEVERITY_META: Record<string, StatusMeta> = {
  critical: DEVICE_STATUS_META.down!,
  warning: DEVICE_STATUS_META.degraded!,
  ok: DEVICE_STATUS_META.up!
}

export function deviceStatusMeta(status?: string | null): StatusMeta {
  return DEVICE_STATUS_META[(status || 'pending').toLowerCase()] || DEVICE_STATUS_META.pending!
}

export function formatBits(bps?: number | null): string {
  if (bps == null) return '—'
  const units = ['bps', 'Kbps', 'Mbps', 'Gbps', 'Tbps']
  let v = bps
  let i = 0
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000
    i++
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`
}

export function formatBytes(bytes?: number | null): string {
  if (bytes == null) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  let v = bytes
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`
}

export function formatUptime(seconds?: number | null): string {
  if (seconds == null) return '—'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export function usageBarClass(pct?: number | null): string {
  const p = pct ?? 0
  return p >= 90 ? 'bg-rose-500' : p >= 75 ? 'bg-amber-500' : 'bg-emerald-500'
}

export function useMonitoring() {
  const { hasApp, hasPermission } = useAuth()
  return {
    hasMonitoring: computed(() => hasApp('monitoring' as any)),
    // operator tier
    canOperate: computed(() => hasPermission('monitoring.scan')),
    // admin tier (device/rule/transport management)
    canManage: computed(() => hasPermission('monitoring.manage')),
    canConfigure: computed(() => hasPermission('monitoring.configure')),
    deviceStatusMeta,
    formatBits,
    formatBytes,
    formatUptime,
    usageBarClass
  }
}
