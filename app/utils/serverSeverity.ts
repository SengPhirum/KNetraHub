// Zabbix's six problem severities (0-5), shared across the Server section's
// triggers, problems, actions, and dashboard. Colors are the app's semantic
// aliases (see app.config.ts / nuxt-ui-v4 conventions) for U* `color=`, plus a
// raw text class for inline `class=` usage and a hex for charts.

export type ServerSeverity = 0 | 1 | 2 | 3 | 4 | 5

export interface SeverityMeta {
  value: ServerSeverity
  key: string
  label: string
  /** Semantic alias for U* component `color=`. */
  color: 'neutral' | 'info' | 'warning' | 'error'
  /** Tailwind text class for inline `class=` (badges/dots). */
  text: string
  /** Background tint class for badges. */
  badge: string
  /** Hex for charts/dots. */
  hex: string
}

export const SEVERITIES: SeverityMeta[] = [
  { value: 0, key: 'not_classified', label: 'Not classified', color: 'neutral', text: 'text-slate-400',  badge: 'bg-slate-500/15 text-slate-300',   hex: '#94a3b8' },
  { value: 1, key: 'information',    label: 'Information',     color: 'info',    text: 'text-sky-400',    badge: 'bg-sky-500/15 text-sky-300',       hex: '#38bdf8' },
  { value: 2, key: 'warning',        label: 'Warning',        color: 'warning', text: 'text-yellow-400', badge: 'bg-yellow-500/15 text-yellow-300', hex: '#eab308' },
  { value: 3, key: 'average',        label: 'Average',        color: 'warning', text: 'text-orange-400', badge: 'bg-orange-500/15 text-orange-300', hex: '#f97316' },
  { value: 4, key: 'high',           label: 'High',           color: 'error',   text: 'text-red-400',    badge: 'bg-red-500/15 text-red-300',       hex: '#ef4444' },
  { value: 5, key: 'disaster',       label: 'Disaster',       color: 'error',   text: 'text-red-600',    badge: 'bg-red-700/20 text-red-400',       hex: '#b91c1c' }
]

const BY_VALUE = new Map<number, SeverityMeta>(SEVERITIES.map((s) => [s.value, s]))

export function severityMeta(value: number | null | undefined): SeverityMeta {
  return BY_VALUE.get(Number(value)) ?? SEVERITIES[0]!
}

export function severityLabel(value: number | null | undefined): string {
  return severityMeta(value).label
}

/** For USelect/USelectMenu `:items` (value-key="value" label-key="label"). */
export const SEVERITY_SELECT_ITEMS = SEVERITIES.map((s) => ({ value: s.value, label: s.label }))
