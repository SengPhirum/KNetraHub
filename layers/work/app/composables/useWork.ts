// Shared Work UI helpers: permission shortcuts resolved against the caller's
// per-app work tier, priority/status metadata, and small formatters. Every
// check here is UX-only; each API re-enforces server-side.
import type { Permission } from '~~/shared/utils/permissions'

export interface PriorityMeta { label: string; icon: string; class: string }

export const PRIORITY_META: Record<string, PriorityMeta> = {
  urgent: { label: 'Urgent', icon: 'i-lucide-flag', class: 'text-rose-400' },
  high: { label: 'High', icon: 'i-lucide-flag', class: 'text-amber-400' },
  normal: { label: 'Normal', icon: 'i-lucide-flag', class: 'text-sky-400' },
  low: { label: 'Low', icon: 'i-lucide-flag', class: 'text-zinc-400' }
}

export const STATUS_GROUP_META: Record<string, { label: string; icon: string }> = {
  open: { label: 'Open', icon: 'i-lucide-circle' },
  active: { label: 'Active', icon: 'i-lucide-circle-dot' },
  done: { label: 'Done', icon: 'i-lucide-circle-check' },
  closed: { label: 'Closed', icon: 'i-lucide-circle-check-big' }
}

export function priorityMeta(p?: string | null): PriorityMeta | null {
  return p ? PRIORITY_META[p] || null : null
}

export function workShortDate(iso?: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  const now = new Date()
  const sameYear = date.getFullYear() === now.getFullYear()
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })
}

export function workDateTime(iso?: string | null): string {
  if (!iso) return '—'
  return String(iso).slice(0, 16).replace('T', ' ')
}

/** Is a due date past (and the task not complete)? */
export function isOverdue(task: { due_at?: string | null; completed_at?: string | null }): boolean {
  return !!task.due_at && !task.completed_at && Date.parse(task.due_at) < Date.now()
}

export function formatDuration(totalSeconds?: number | null): string {
  const seconds = Number(totalSeconds) || 0
  if (seconds < 60) return `${seconds}s`
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`
}

export function formatEstimate(minutes?: number | null): string {
  if (!minutes) return '—'
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return hours ? (rest ? `${hours}h ${rest}m` : `${hours}h`) : `${rest}m`
}

/** Initials for an avatar chip. */
export function userInitials(username?: string | null): string {
  const name = String(username || '').trim()
  if (!name) return '?'
  const parts = name.split(/[\s._-]+/).filter(Boolean)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || name.slice(0, 2).toUpperCase()
}

/** Stable pastel background for a username chip. */
export function userColor(username?: string | null): string {
  const palette = ['#0ea5e9', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#f43f5e', '#6366f1', '#14b8a6']
  let hash = 0
  for (const ch of String(username || '')) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return palette[hash % palette.length]!
}

export function useWork() {
  const { hasApp, hasPermission } = useAuth()
  const has = (p: Permission) => hasPermission(p)
  return {
    hasWork: computed(() => hasApp('work' as any)),
    isManager: computed(() => hasApp('work' as any, 'manager')),
    isAdmin: computed(() => hasApp('work' as any, 'admin')),
    can: (p: Permission) => has(p),
    canCreate: computed(() => has('work.create')),
    canUpdate: computed(() => has('work.update')),
    canComment: computed(() => has('work.comment')),
    canAssign: computed(() => has('work.assign')),
    canTrackTime: computed(() => has('work.time')),
    canUseDocs: computed(() => has('work.docs')),
    canShare: computed(() => has('work.share')),
    canDelete: computed(() => has('work.delete')),
    canSettings: computed(() => has('work.settings')),
    canAudit: computed(() => has('work.audit'))
  }
}
