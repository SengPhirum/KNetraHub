// Shared PAM (Privileged Access) UI helpers: permission shortcuts resolved
// against the caller's per-app pam tier, status/severity metadata, and small
// formatters. Every check here is UX-only; each API re-enforces server-side.
import type { Permission } from '~~/shared/utils/permissions'

export interface SeverityMeta { label: string; badge: string; dot: string }

export const SEVERITY_META: Record<string, SeverityMeta> = {
  info: { label: 'Info', badge: 'bg-sky-500/10 text-sky-400 ring-1 ring-inset ring-sky-500/30', dot: 'bg-sky-500' },
  notice: { label: 'Notice', badge: 'bg-sky-500/10 text-sky-400 ring-1 ring-inset ring-sky-500/30', dot: 'bg-sky-500' },
  low: { label: 'Low', badge: 'bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/30', dot: 'bg-emerald-500' },
  medium: { label: 'Medium', badge: 'bg-amber-500/10 text-amber-400 ring-1 ring-inset ring-amber-500/30', dot: 'bg-amber-500' },
  warning: { label: 'Warning', badge: 'bg-amber-500/10 text-amber-400 ring-1 ring-inset ring-amber-500/30', dot: 'bg-amber-500' },
  high: { label: 'High', badge: 'bg-orange-500/10 text-orange-400 ring-1 ring-inset ring-orange-500/30', dot: 'bg-orange-500' },
  critical: { label: 'Critical', badge: 'bg-rose-500/10 text-rose-400 ring-1 ring-inset ring-rose-500/30', dot: 'bg-rose-500' }
}

export function severityMeta(s?: string | null): SeverityMeta {
  return SEVERITY_META[(s || 'info').toLowerCase()] || SEVERITY_META.info!
}

export const CRITICALITY_BADGE: Record<string, string> = {
  low: 'bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/30',
  medium: 'bg-amber-500/10 text-amber-400 ring-1 ring-inset ring-amber-500/30',
  high: 'bg-orange-500/10 text-orange-400 ring-1 ring-inset ring-orange-500/30',
  critical: 'bg-rose-500/10 text-rose-400 ring-1 ring-inset ring-rose-500/30'
}

export function rotationBadge(status?: string | null): string {
  switch (status) {
    case 'managed': return 'bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/30'
    case 'pending': return 'bg-amber-500/10 text-amber-400 ring-1 ring-inset ring-amber-500/30'
    case 'failed': return 'bg-rose-500/10 text-rose-400 ring-1 ring-inset ring-rose-500/30'
    case 'disabled': return 'bg-zinc-500/10 text-zinc-400 ring-1 ring-inset ring-zinc-500/30'
    default: return 'text-faint ring-1 ring-inset ring-hull'
  }
}

const OK = 'bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/30'
const WARN = 'bg-amber-500/10 text-amber-400 ring-1 ring-inset ring-amber-500/30'
const BAD = 'bg-rose-500/10 text-rose-400 ring-1 ring-inset ring-rose-500/30'
const INFO = 'bg-sky-500/10 text-sky-400 ring-1 ring-inset ring-sky-500/30'
const MUTE = 'bg-zinc-500/10 text-zinc-400 ring-1 ring-inset ring-zinc-500/30'

/** Shared status→badge map for domain statuses across PAM (campaigns, jit, vendors, requests…). */
export const STATUS_BADGE: Record<string, string> = {
  // lifecycle / campaigns
  open: INFO, in_progress: WARN, completed: OK, overdue: BAD,
  // decisions / risk events
  pending: WARN, certified: OK, revoked: BAD, delegated: INFO, dismissed: MUTE, resolved: OK, investigating: WARN,
  // vendor / generic
  active: OK, suspended: BAD, expired: MUTE, invited: INFO,
  // requests / grants
  approved: OK, rejected: BAD, cancelled: MUTE, exhausted: MUTE, draft: MUTE,
  // sessions
  starting: INFO, idle: WARN, ended: MUTE, terminated: BAD, error: BAD,
  // jit revoke status
  failed: BAD, reconciled: OK
}
export function statusBadge(status?: string | null): string {
  return STATUS_BADGE[(status || '').toLowerCase()] || 'text-faint ring-1 ring-inset ring-hull'
}

export function shortTime(iso?: string | null): string {
  if (!iso) return '—'
  return String(iso).slice(0, 16).replace('T', ' ')
}

export function usePam() {
  const { hasApp, hasPermission } = useAuth()
  const has = (p: Permission) => hasPermission(p)
  return {
    hasPam: computed(() => hasApp('pam' as any)),
    isAdmin: computed(() => hasApp('pam' as any, 'admin')),
    can: (p: Permission) => has(p),
    canManageSafes: computed(() => has('pam.safe.manage')),
    canAddAccount: computed(() => has('pam.account.manage')),
    canReveal: computed(() => has('pam.account.reveal')),
    canRotate: computed(() => has('pam.account.rotate')),
    canRequest: computed(() => has('pam.request.create')),
    canApprove: computed(() => has('pam.request.approve')),
    canMonitor: computed(() => has('pam.session.monitor')),
    canTerminate: computed(() => has('pam.session.terminate')),
    canManagePlatforms: computed(() => has('pam.platform.manage')),
    canManageSecrets: computed(() => has('pam.secret.manage')),
    canUseSecrets: computed(() => has('pam.secret.use')),
    canViewAudit: computed(() => has('pam.audit.view')),
    canSettings: computed(() => has('pam.settings')),
    // Stage 7–8 subsystems
    canViewCertifications: computed(() => has('pam.certification.view')),
    canManageCertifications: computed(() => has('pam.certification.manage')),
    canManageReports: computed(() => has('pam.report.manage')),
    canExportReports: computed(() => has('pam.report.export')),
    canManageRisk: computed(() => has('pam.risk.manage')),
    canManageVendors: computed(() => has('pam.safe.manage')),
    canViewJit: computed(() => has('pam.request.view')),
    canManageJit: computed(() => has('pam.request.approve')),
    severityMeta,
    shortTime,
    statusBadge
  }
}
