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

// pg returns BIGINT/NUMERIC columns (speed_bps, *_bytes, uptime_seconds) as
// strings — every formatter must coerce before doing number math.
export function formatBits(bps?: number | string | null): string {
  if (bps == null) return '—'
  let v = Number(bps)
  if (!Number.isFinite(v)) return '—'
  const units = ['bps', 'Kbps', 'Mbps', 'Gbps', 'Tbps']
  let i = 0
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000
    i++
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`
}

export function formatBytes(bytes?: number | string | null): string {
  if (bytes == null) return '—'
  let v = Number(bytes)
  if (!Number.isFinite(v)) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`
}

export function formatUptime(seconds?: number | string | null): string {
  if (seconds == null) return '—'
  const s = Number(seconds)
  if (!Number.isFinite(s)) return '—'
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export function usageBarClass(pct?: number | null): string {
  const p = pct ?? 0
  return p >= 90 ? 'bg-rose-500' : p >= 75 ? 'bg-amber-500' : 'bg-emerald-500'
}

/** Device-type taxonomy → icon/label (see DEVICE_TYPES in shared/constants). */
export const DEVICE_TYPE_META: Record<string, { label: string; icon: string }> = {
  appliance: { label: 'Appliance', icon: 'i-lucide-box' },
  firewall: { label: 'Firewall', icon: 'i-lucide-shield' },
  management: { label: 'Management', icon: 'i-lucide-wrench' },
  network: { label: 'Network', icon: 'i-lucide-network' },
  power: { label: 'Power', icon: 'i-lucide-zap' },
  server: { label: 'Server', icon: 'i-lucide-server' },
  storage: { label: 'Storage', icon: 'i-lucide-hard-drive' },
  wireless: { label: 'Wireless', icon: 'i-lucide-wifi' }
}

export function deviceTypeMeta(type?: string | null): { label: string; icon: string } {
  return DEVICE_TYPE_META[(type || 'server').toLowerCase()] || DEVICE_TYPE_META.server!
}

/** Compact relative time: "3mo 1d ago". */
export function timeAgo(iso?: string | Date | null): string {
  if (!iso) return '—'
  let s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  const units: Array<[string, number]> = [['y', 31536000], ['mo', 2592000], ['d', 86400], ['h', 3600], ['m', 60]]
  const parts: string[] = []
  for (const [label, span] of units) {
    const v = Math.floor(s / span)
    if (v > 0) {
      parts.push(`${v}${label}`)
      s -= v * span
    }
    if (parts.length === 2) break
  }
  return `${parts.join(' ')} ago`
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
    deviceTypeMeta,
    formatBits,
    formatBytes,
    formatUptime,
    timeAgo,
    usageBarClass
  }
}
