/**
 * Counter processing: 32/64-bit deltas with rollover, reboot, reset and
 * speed-change handling. Pure functions — unit-tested in tests/unit.
 */

const MAX32 = 4294967296n // 2^32
const MAX64 = 18446744073709551616n // 2^64

export interface CounterDeltaInput {
  previous: bigint | null
  current: bigint | null
  is64bit: boolean
  elapsedSeconds: number
  /**
   * Plausibility ceiling in units/second (e.g. link speed in bytes/s for
   * octet counters). Used to reject impossible rollover interpretations.
   * Null = no ceiling known.
   */
  maxPerSecond?: number | null
  /** True when the device rebooted (uptime regression) since previous poll. */
  deviceRebooted?: boolean
}

export type CounterDeltaResult =
  | { kind: 'rate'; delta: bigint; perSecond: number }
  | { kind: 'reset'; reason: 'reboot' | 'discontinuity' | 'first-poll' | 'invalid-delta' }

/**
 * Compute a counter delta and per-second rate.
 *
 * - First poll (no previous) → reset('first-poll'): seed only.
 * - Device reboot → reset('reboot'): counters restarted, delta meaningless.
 * - current < previous → try rollover at the counter width; if the resulting
 *   rate is implausible (exceeds maxPerSecond with margin) treat as a
 *   discontinuity (counter reset by interface flap / clear counters).
 * - Impossibly large forward deltas (beyond ceiling) are rejected too — this
 *   catches replaced interfaces reusing an ifIndex.
 */
export function counterDelta(input: CounterDeltaInput): CounterDeltaResult {
  const { previous, current, is64bit, elapsedSeconds } = input
  if (current == null) return { kind: 'reset', reason: 'invalid-delta' }
  if (previous == null) return { kind: 'reset', reason: 'first-poll' }
  if (elapsedSeconds <= 0 || elapsedSeconds > 86400) return { kind: 'reset', reason: 'invalid-delta' }
  if (input.deviceRebooted) return { kind: 'reset', reason: 'reboot' }

  let delta: bigint
  if (current >= previous) {
    delta = current - previous
  } else {
    // Candidate rollover interpretation
    const width = is64bit ? MAX64 : MAX32
    delta = width - previous + current
    if (!plausible(delta, elapsedSeconds, input.maxPerSecond, is64bit)) {
      return { kind: 'reset', reason: 'discontinuity' }
    }
  }

  if (!plausible(delta, elapsedSeconds, input.maxPerSecond, is64bit)) {
    return { kind: 'reset', reason: 'discontinuity' }
  }

  return { kind: 'rate', delta, perSecond: Number(delta) / elapsedSeconds }
}

function plausible(delta: bigint, elapsedSeconds: number, maxPerSecond: number | null | undefined, is64bit: boolean): boolean {
  if (delta < 0n) return false
  if (maxPerSecond && maxPerSecond > 0) {
    // 4x margin: bursts above nominal speed happen (speed misreported,
    // sub-interval bursts) but 4x over the whole interval means garbage.
    const ceiling = BigInt(Math.ceil(maxPerSecond * elapsedSeconds)) * 4n
    if (delta > ceiling) return false
  } else if (!is64bit) {
    // Without a known ceiling, a 32-bit counter can't legitimately advance
    // more than its full range in one interval.
    if (delta >= MAX32) return false
  }
  return true
}

/** Octets/s → bits/s. */
export function octetsToBps(perSecondOctets: number): number {
  return perSecondOctets * 8
}

/** Utilization percent from bits/s over a link speed in bits/s. */
export function utilizationPercent(bps: number, speedBps: number | null | undefined): number | null {
  if (!speedBps || speedBps <= 0) return null
  return Math.min(100, (bps / speedBps) * 100)
}

/**
 * Detect a device reboot from sysUpTime (TimeTicks, hundredths of seconds).
 * Uptime regression larger than clock jitter (60s) = reboot.
 */
export function detectReboot(previousUptimeSeconds: number | null | undefined, currentUptimeSeconds: number | null | undefined): boolean {
  if (previousUptimeSeconds == null || currentUptimeSeconds == null) return false
  return currentUptimeSeconds + 60 < previousUptimeSeconds
}

/** 95th percentile of a series (billing). Standard nearest-rank method. */
export function percentile95(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.ceil(sorted.length * 0.95)
  return sorted[Math.min(rank, sorted.length) - 1]!
}
