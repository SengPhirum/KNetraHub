// Shared IPAM (IP Management) UI helpers: status metadata, usage colouring, and
// permission shortcuts resolved against the user's per-app ipmgt tier. Kept in
// one place so every IPAM page renders statuses/usage identically.

export interface IpStatusMeta {
  key: string
  label: string
  /** Tailwind bg/text classes for a solid swatch (grid cells). */
  swatch: string
  /** Tailwind classes for a subtle badge. */
  badge: string
  dot: string
}

export const IP_STATUS_META: Record<string, IpStatusMeta> = {
  free:       { key: 'free',       label: 'Free',       swatch: 'bg-surface-2 text-faint',            badge: 'text-faint ring-1 ring-inset ring-hull',                 dot: 'bg-slate-400' },
  used:       { key: 'used',       label: 'Used',       swatch: 'bg-emerald-500/80 text-white',        badge: 'bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/30', dot: 'bg-emerald-500' },
  reserved:   { key: 'reserved',   label: 'Reserved',   swatch: 'bg-amber-500/80 text-white',          badge: 'bg-amber-500/10 text-amber-400 ring-1 ring-inset ring-amber-500/30',   dot: 'bg-amber-500' },
  dhcp:       { key: 'dhcp',       label: 'DHCP',       swatch: 'bg-sky-500/80 text-white',            badge: 'bg-sky-500/10 text-sky-400 ring-1 ring-inset ring-sky-500/30',         dot: 'bg-sky-500' },
  offline:    { key: 'offline',    label: 'Offline',    swatch: 'bg-rose-500/80 text-white',           badge: 'bg-rose-500/10 text-rose-400 ring-1 ring-inset ring-rose-500/30',      dot: 'bg-rose-500' },
  deprecated: { key: 'deprecated', label: 'Deprecated', swatch: 'bg-zinc-500/80 text-white',           badge: 'bg-zinc-500/10 text-zinc-400 ring-1 ring-inset ring-zinc-500/30',      dot: 'bg-zinc-500' },
  gateway:    { key: 'gateway',    label: 'Gateway',    swatch: 'bg-violet-500/80 text-white',         badge: 'bg-violet-500/10 text-violet-400 ring-1 ring-inset ring-violet-500/30', dot: 'bg-violet-500' },
  conflict:   { key: 'conflict',   label: 'Conflict',   swatch: 'bg-red-600 text-white',               badge: 'bg-red-600/10 text-red-400 ring-1 ring-inset ring-red-600/30',         dot: 'bg-red-600' }
}

/** Statuses selectable when creating/editing an address (free is implicit). */
export const SELECTABLE_STATUSES = ['used', 'reserved', 'dhcp', 'offline', 'deprecated', 'gateway'] as const

export function ipStatusMeta(status?: string | null): IpStatusMeta {
  return IP_STATUS_META[(status || 'free').toLowerCase()] || IP_STATUS_META.free!
}

/** Bar colour for a usage percentage (green < 60 < orange < 80 < red). */
export function usageBarClass(pct: number): string {
  return pct >= 80 ? 'bg-rose-500' : pct >= 60 ? 'bg-amber-500' : 'bg-emerald-500'
}

export function useIpam() {
  const { hasApp, hasPermission } = useAuth()
  const has = (app = 'ipmgt') => hasApp(app as any)
  return {
    hasIpam: computed(() => has()),
    canCreate: computed(() => hasPermission('ipmgt.create')),
    canUpdate: computed(() => hasPermission('ipmgt.update')),
    canDelete: computed(() => hasPermission('ipmgt.delete')),
    canAssign: computed(() => hasPermission('ipmgt.assign')),
    canSettings: computed(() => hasPermission('ipmgt.settings')),
    statusItems: SELECTABLE_STATUSES.map((s) => ({ value: s, label: ipStatusMeta(s).label })),
    ipStatusMeta,
    usageBarClass
  }
}
