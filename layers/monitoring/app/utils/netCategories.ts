// Single source of truth for the Network module's device categories. Both the
// Add Device modal (app/pages/net/devices/index.vue) and the device Settings tab
// (app/pages/net/devices/[id].vue) import these so their dropdowns can never
// drift apart again (they previously used different labels for the same values).
// `color` is a semantic alias registered in app/app.config.ts — raw Tailwind
// names (red/blue/…) do NOT work as a U* component `color=` prop.

export interface DeviceCategory {
  value: string
  /** Long label used in the Add Device modal + filter dropdown. */
  label: string
  /** Short label used where space is tight (badges, settings). */
  short: string
  color: 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | 'neutral'
  icon: string
}

export const DEVICE_CATEGORIES: DeviceCategory[] = [
  { value: 'network', label: 'Network Infrastructure', short: 'Network', color: 'primary',   icon: 'i-lucide-router' },
  { value: 'server',  label: 'Servers & Cloud',        short: 'Server',  color: 'secondary', icon: 'i-lucide-server' },
  { value: 'storage', label: 'Storage & Appliances',   short: 'Storage', color: 'warning',   icon: 'i-lucide-hard-drive' },
  { value: 'iot',     label: 'IoT & Sensors',          short: 'IoT',     color: 'success',   icon: 'i-lucide-cpu' },
  { value: 'ping-only', label: 'Ping-Only Devices',    short: 'Ping Only', color: 'neutral', icon: 'i-lucide-radio' }
]

/** Items for the Add Device / Settings category select ({ value, label }). */
export const CATEGORY_SELECT_ITEMS = DEVICE_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))

/** Items for the device-list filter (prepends an "All Devices" option). */
export const CATEGORY_FILTER_ITEMS = [{ value: 'all', label: 'All Devices' }, ...CATEGORY_SELECT_ITEMS]

const BY_VALUE = new Map(DEVICE_CATEGORIES.map((c) => [c.value, c]))

export function deviceCategory(value: string | null | undefined): DeviceCategory | undefined {
  return value ? BY_VALUE.get(value) : undefined
}

/** Short label for a category value, falling back to the raw value. */
export function categoryLabel(value: string | null | undefined): string {
  return deviceCategory(value)?.short ?? (value || 'Unknown')
}

/** Semantic badge color for a category value (neutral fallback). */
export function categoryColor(value: string | null | undefined): DeviceCategory['color'] {
  return deviceCategory(value)?.color ?? 'neutral'
}
