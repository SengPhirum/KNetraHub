import type { HostMetrics } from './netMonitor'

/**
 * Map a Zabbix-style item key to the collected SNMP host metric. Uptime is
 * returned in seconds (from sysUpTime ticks). Unknown keys return undefined so
 * the poller can fall back to the item's raw snmp_oid.
 */
export function metricForItemKey(key: string, m: HostMetrics): number | null | undefined {
  switch (key) {
    case 'system.cpu.util': return m.cpuUtil
    case 'vm.memory.util': return m.memUtil
    case 'vfs.fs.size[/]': return m.rootFsUtil
    case 'system.cpu.load': return m.load1
    case 'system.uptime': return m.uptimeTicks == null ? null : Math.floor(m.uptimeTicks / 100)
    default: return undefined
  }
}

/** Evaluate a trigger's threshold condition. */
export function evaluateCondition(value: number, operator: string, threshold: number): boolean {
  switch (operator) {
    case '>': return value > threshold
    case '<': return value < threshold
    case '>=': return value >= threshold
    case '<=': return value <= threshold
    case '=': return value === threshold
    case '!=': return value !== threshold
    default: return false
  }
}
