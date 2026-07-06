// Server-side helpers for the net_dashboards table. The `layout` column is a
// JSON-encoded widget array ({ i, x, y, w, h, type, config }); these keep the
// parse/serialize defensive so a malformed row never throws in a route handler.

export interface DashboardWidget {
  i: string
  x: number
  y: number
  w: number
  h: number
  type: string
  config?: Record<string, unknown>
}

export function parseLayout(raw: unknown): DashboardWidget[] {
  if (Array.isArray(raw)) return raw as DashboardWidget[]
  if (typeof raw !== 'string') return []
  try {
    const v = JSON.parse(raw || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

/** Normalize an incoming layout to a JSON string safe to store. */
export function serializeLayout(raw: unknown): string {
  return JSON.stringify(parseLayout(raw))
}
