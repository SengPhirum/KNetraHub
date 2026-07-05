// Single source of truth for the Network module's device *type* (role/hardware
// class — router, switch, server, …), distinct from `category` (asset-class:
// network/server/storage/iot/ping-only, see netCategories.ts). Persisted on the
// existing `net_devices.type` column. Both the Add Device modal and the device
// Settings tab import this so their dropdowns can't drift apart.

export interface DeviceType {
  value: string
  label: string
  icon: string
}

export const DEVICE_TYPES: DeviceType[] = [
  { value: 'Unknown',       label: 'Unknown',        icon: 'i-lucide-help-circle' },
  { value: 'Router',        label: 'Router',         icon: 'i-lucide-router' },
  { value: 'Switch',        label: 'Switch',         icon: 'i-lucide-network' },
  { value: 'Firewall',      label: 'Firewall',       icon: 'i-lucide-shield' },
  { value: 'Load Balancer', label: 'Load Balancer',  icon: 'i-lucide-scale' },
  { value: 'Access Point',  label: 'Access Point',   icon: 'i-lucide-wifi' },
  { value: 'Server',        label: 'Server',         icon: 'i-lucide-server' },
  { value: 'Storage',       label: 'Storage',        icon: 'i-lucide-hard-drive' },
  { value: 'Printer',       label: 'Printer',        icon: 'i-lucide-printer' },
  { value: 'UPS',           label: 'UPS / Power',    icon: 'i-lucide-battery-charging' },
  { value: 'Camera',        label: 'Camera',         icon: 'i-lucide-camera' },
  { value: 'IoT',           label: 'IoT Device',     icon: 'i-lucide-cpu' },
  { value: 'Other',         label: 'Other',          icon: 'i-lucide-box' }
]

export const DEVICE_TYPE_SELECT_ITEMS = DEVICE_TYPES.map((t) => ({ value: t.value, label: t.label }))

const BY_VALUE = new Map(DEVICE_TYPES.map((t) => [t.value, t]))

export function deviceTypeMeta(value: string | null | undefined): DeviceType | undefined {
  return value ? BY_VALUE.get(value) : undefined
}

export function deviceTypeIcon(value: string | null | undefined): string {
  return deviceTypeMeta(value)?.icon ?? 'i-lucide-box'
}
