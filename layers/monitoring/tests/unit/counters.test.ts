import { describe, it, expect } from 'vitest'
import { counterDelta, detectReboot, utilizationPercent, octetsToBps, percentile95 } from '../../server/core/counters'

describe('counterDelta', () => {
  const base = { is64bit: false, elapsedSeconds: 300 }

  it('computes a simple forward delta and rate', () => {
    const r = counterDelta({ ...base, previous: 1000n, current: 4000n })
    expect(r.kind).toBe('rate')
    if (r.kind === 'rate') {
      expect(r.delta).toBe(3000n)
      expect(r.perSecond).toBe(10)
    }
  })

  it('seeds on first poll', () => {
    const r = counterDelta({ ...base, previous: null, current: 4000n })
    expect(r).toEqual({ kind: 'reset', reason: 'first-poll' })
  })

  it('handles 32-bit rollover with a plausible rate', () => {
    // previous near 2^32, current small — rollover delta = 2^32 - prev + cur
    const prev = 4294967000n
    const cur = 1000n
    const r = counterDelta({ ...base, previous: prev, current: cur, maxPerSecond: 1_000_000 })
    expect(r.kind).toBe('rate')
    if (r.kind === 'rate') expect(r.delta).toBe(4294967296n - prev + cur)
  })

  it('handles 64-bit rollover', () => {
    const max = 18446744073709551616n
    const prev = max - 500n
    const r = counterDelta({ previous: prev, current: 500n, is64bit: true, elapsedSeconds: 300, maxPerSecond: 1_000_000 })
    expect(r.kind).toBe('rate')
    if (r.kind === 'rate') expect(r.delta).toBe(1000n)
  })

  it('treats implausible rollover as discontinuity (counter cleared)', () => {
    // 10Mbps link (1.25 MB/s): a rollover interpretation of ~4GB over 300s is impossible
    const r = counterDelta({ ...base, previous: 4_000_000_000n, current: 100n, maxPerSecond: 1_250_000 / 100 })
    expect(r).toEqual({ kind: 'reset', reason: 'discontinuity' })
  })

  it('resets on device reboot even with a forward delta', () => {
    const r = counterDelta({ ...base, previous: 1000n, current: 2000n, deviceRebooted: true })
    expect(r).toEqual({ kind: 'reset', reason: 'reboot' })
  })

  it('rejects impossible forward deltas above the speed ceiling', () => {
    // 1 Gbps = 125 MB/s → ceiling 125e6*300*4 = 1.5e11; delta 1e12 is invalid
    const r = counterDelta({ ...base, previous: 0n, current: 1_000_000_000_000n, maxPerSecond: 125_000_000 })
    expect(r).toEqual({ kind: 'reset', reason: 'discontinuity' })
  })

  it('rejects zero/negative/absurd elapsed time', () => {
    expect(counterDelta({ ...base, elapsedSeconds: 0, previous: 1n, current: 2n }).kind).toBe('reset')
    expect(counterDelta({ ...base, elapsedSeconds: 100000, previous: 1n, current: 2n }).kind).toBe('reset')
  })
})

describe('detectReboot', () => {
  it('detects uptime regression beyond jitter', () => {
    expect(detectReboot(10_000, 120)).toBe(true)
  })
  it('ignores small jitter', () => {
    expect(detectReboot(10_000, 9_970)).toBe(false)
  })
  it('ignores missing values', () => {
    expect(detectReboot(null, 100)).toBe(false)
    expect(detectReboot(100, null)).toBe(false)
  })
})

describe('rates & utilization', () => {
  it('converts octets/s to bps', () => {
    expect(octetsToBps(125)).toBe(1000)
  })
  it('computes utilization and clamps to 100', () => {
    expect(utilizationPercent(500_000_000, 1_000_000_000)).toBe(50)
    expect(utilizationPercent(2_000_000_000, 1_000_000_000)).toBe(100)
    expect(utilizationPercent(100, 0)).toBeNull()
  })
})

describe('percentile95', () => {
  it('returns null for empty input', () => {
    expect(percentile95([])).toBeNull()
  })
  it('computes nearest-rank 95th percentile', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1) // 1..100
    expect(percentile95(values)).toBe(95)
  })
  it('single value', () => {
    expect(percentile95([42])).toBe(42)
  })
})
