// Shared traffic-light styling for the CPU/RAM/Disk usage gauges scattered
// across the Docker app (dashboard, services, nodes, stacks, tasks). Each of
// those pages used to carry its own copy of this logic, which is how the
// color-by-usage threshold got added to the dashboard ring but missed on
// every other page's rings - centralizing it here means a future change only
// has to happen once.
const RING_WARNING_PERCENT = 75
const RING_DANGER_PERCENT = 95

export function useUsageRing() {
  function clampPercent(value?: number | null) {
    if (value == null || !Number.isFinite(value)) return 0
    return Math.max(0, Math.min(100, value))
  }

  function ringColor(percent: number): string {
    if (percent >= RING_DANGER_PERCENT) return 'var(--color-down)'
    if (percent >= RING_WARNING_PERCENT) return 'var(--color-pending)'
    return 'var(--color-running)'
  }

  function track(hullPercent: number, trackColor: string) {
    return `color-mix(in srgb, var(--color-hull) ${hullPercent}%, ${trackColor}) 0`
  }

  // CPU/RAM/Disk gauges - a full ring means "at capacity", so it goes amber
  // then red as it approaches the limit.
  function usageRingStyle(percent?: number | null, opts: { hullPercent?: number; trackColor?: string } = {}) {
    const safe = clampPercent(percent)
    const { hullPercent = 72, trackColor = 'var(--color-surface-2)' } = opts
    return { background: `conic-gradient(${ringColor(safe)} ${safe}%, ${track(hullPercent, trackColor)})` }
  }

  // Fulfillment gauges (e.g. replicas running/desired) - a full ring means
  // healthy, not at-capacity, so it always stays green.
  function fulfillmentRingStyle(percent?: number | null, opts: { hullPercent?: number; trackColor?: string } = {}) {
    const safe = clampPercent(percent)
    const { hullPercent = 72, trackColor = 'var(--color-surface-2)' } = opts
    return { background: `conic-gradient(var(--color-running) ${safe}%, ${track(hullPercent, trackColor)})` }
  }

  return { clampPercent, ringColor, usageRingStyle, fulfillmentRingStyle }
}
