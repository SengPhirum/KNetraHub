// Device type (role/hardware class) options for the IPAM Device form. A local
// port of layers/monitoring/app/utils/netDeviceTypes.ts's value vocabulary -
// kept separate rather than imported cross-layer.

export interface IpamDeviceType { value: string; label: string; icon: string }

export const IPAM_DEVICE_TYPES: IpamDeviceType[] = [
  { value: 'Unknown', label: 'Unknown', icon: 'i-lucide-help-circle' },
  { value: 'Router', label: 'Router', icon: 'i-lucide-router' },
  { value: 'Switch', label: 'Switch', icon: 'i-lucide-network' },
  { value: 'Firewall', label: 'Firewall', icon: 'i-lucide-shield' },
  { value: 'Load Balancer', label: 'Load Balancer', icon: 'i-lucide-scale' },
  { value: 'Access Point', label: 'Access Point', icon: 'i-lucide-wifi' },
  { value: 'Server', label: 'Server', icon: 'i-lucide-server' },
  { value: 'Storage', label: 'Storage', icon: 'i-lucide-hard-drive' },
  { value: 'Printer', label: 'Printer', icon: 'i-lucide-printer' },
  { value: 'UPS', label: 'UPS / Power', icon: 'i-lucide-battery-charging' },
  { value: 'Other', label: 'Other', icon: 'i-lucide-box' }
]

export const IPAM_DEVICE_TYPE_ITEMS = IPAM_DEVICE_TYPES.map((t) => ({ value: t.value, label: t.label }))

const BY_VALUE = new Map(IPAM_DEVICE_TYPES.map((t) => [t.value, t]))

export function ipamDeviceTypeIcon(value: string | null | undefined): string {
  return (value ? BY_VALUE.get(value) : undefined)?.icon ?? 'i-lucide-box'
}

export const IPAM_DEVICE_STATUS_ITEMS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'decommissioned', label: 'Decommissioned' }
]
