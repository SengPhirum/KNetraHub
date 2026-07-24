import { describe, it, expect } from 'vitest'
import {
  isOffHours, parseAutoResponse, parseConfig, threshold,
  evalOffHours, evalConcurrentSources, evalNewSourceIp, evalFirstCriticalAccess,
  evalRepeatedFailedAccess, evalRepeatedRejection, evalRotationOverdue,
  evalSessionWithoutRecording, evalVendorOutOfWindow
} from '../../layers/pam/server/utils/pamRiskEngineCore'

const BH = { days: [1, 2, 3, 4, 5], start: '07:00', end: '19:00' }

describe('isOffHours', () => {
  it('flags weekends, before-open and after-close; clears business hours', () => {
    expect(isOffHours('2026-07-25T10:00:00Z', BH).off).toBe(true)   // Saturday
    expect(isOffHours('2026-07-24T03:00:00Z', BH).off).toBe(true)   // Fri 03:00 (before 07:00)
    expect(isOffHours('2026-07-24T20:00:00Z', BH).off).toBe(true)   // Fri 20:00 (after 19:00)
    expect(isOffHours('2026-07-24T10:00:00Z', BH).off).toBe(false)  // Fri 10:00
  })
  it('honours a timezone offset', () => {
    // 2026-07-24T23:00Z is 06:00 next day at +7h → still before 07:00 → off.
    expect(isOffHours('2026-07-24T23:00:00Z', { ...BH, tzOffsetMinutes: 420 }).off).toBe(true)
    // 2026-07-24T02:00Z is 09:00 at +7h on a Friday → business hours.
    expect(isOffHours('2026-07-24T02:00:00Z', { ...BH, tzOffsetMinutes: 420 }).off).toBe(false)
  })
})

describe('config parsing', () => {
  it('parses auto-responses and thresholds with safe fallbacks', () => {
    expect(parseAutoResponse('["alert","block_session"]', [])).toEqual(['alert', 'block_session'])
    expect(parseAutoResponse('not json', ['alert'])).toEqual(['alert'])
    expect(parseAutoResponse(null, ['x'])).toEqual(['x'])
    expect(threshold(parseConfig('{"threshold":9}'), 'threshold', 5)).toBe(9)
    expect(threshold(parseConfig(null), 'threshold', 5)).toBe(5)
  })
})

describe('evaluators', () => {
  it('evalOffHours emits one deduped candidate per off-hours session', () => {
    const c = evalOffHours([
      { id: 's1', principal: 'alice', started_at: '2026-07-25T10:00:00Z' },
      { id: 's2', principal: 'bob', started_at: '2026-07-24T10:00:00Z' } // in-hours
    ] as any, BH)
    expect(c.map((x) => x.sessionId)).toEqual(['s1'])
    expect(c[0].dedupeKey).toBe('off_hours|s1')
  })

  it('evalConcurrentSources fires only when >1 distinct source per principal', () => {
    const c = evalConcurrentSources([
      { id: 'a', principal: 'alice', source_ip: '10.0.0.1' },
      { id: 'b', principal: 'alice', source_ip: '10.0.0.2' },
      { id: 'c', principal: 'bob', source_ip: '10.0.0.9' },
      { id: 'd', principal: 'bob', source_ip: '10.0.0.9' }
    ] as any, '2026-07-24T10')
    expect(c).toHaveLength(1)
    expect(c[0].actor).toBe('alice')
  })

  it('evalNewSourceIp respects the seen set', () => {
    const seen = new Set(['alice|10.0.0.1'])
    const c = evalNewSourceIp([
      { id: 's1', principal: 'alice', source_ip: '10.0.0.1', started_at: 't' },
      { id: 's2', principal: 'alice', source_ip: '10.0.0.2', started_at: 't' }
    ] as any, seen)
    expect(c.map((x) => x.evidence)).toEqual([{ sourceIp: '10.0.0.2' }])
  })

  it('evalFirstCriticalAccess skips accounts already accessed', () => {
    const prior = new Set(['alice|acc1'])
    const c = evalFirstCriticalAccess([
      { id: 's1', principal: 'alice', account_id: 'acc1', target: 'db', started_at: 't' },
      { id: 's2', principal: 'alice', account_id: 'acc2', target: 'root', started_at: 't' }
    ] as any, prior)
    expect(c.map((x) => x.accountId)).toEqual(['acc2'])
  })

  it('threshold-based rules only fire at/above threshold', () => {
    expect(evalRepeatedFailedAccess([{ key: 'a', count: 5 }, { key: 'b', count: 4 }], 5, 'b')).toHaveLength(1)
    expect(evalRepeatedRejection([{ key: 'a', count: 3 }], 3, 'd')).toHaveLength(1)
  })

  it('evalRotationOverdue flags overdue managed + failed rotations', () => {
    const c = evalRotationOverdue([
      { id: 'a1', name: 'root', auto_managed: true, rotation_status: 'managed', next_rotation_at: '2000-01-01T00:00:00Z' },
      { id: 'a2', name: 'svc', auto_managed: true, rotation_status: 'failed', next_rotation_at: null },
      { id: 'a3', name: 'ok', auto_managed: true, rotation_status: 'managed', next_rotation_at: '2999-01-01T00:00:00Z' }
    ] as any, '2026-07-24T00:00:00Z', '2026-07-24')
    expect(c.map((x) => x.accountId).sort()).toEqual(['a1', 'a2'])
  })

  it('evalSessionWithoutRecording ignores stored/disabled recordings', () => {
    const c = evalSessionWithoutRecording([
      { id: 's1', principal: 'a', recording_required: true, recording_status: 'failed' },
      { id: 's2', principal: 'b', recording_required: true, recording_status: 'stored' },
      { id: 's3', principal: 'c', recording_required: false, recording_status: 'failed' }
    ] as any)
    expect(c.map((x) => x.sessionId)).toEqual(['s1'])
  })

  it('evalVendorOutOfWindow flags expired contracts and non-active orgs', () => {
    const c = evalVendorOutOfWindow([
      { id: 'v1', email: 'x@a', vendor_id: 'o1', vendor_name: 'Acme', vu_status: 'active', vendor_status: 'active', contract_end: '2000-01-01T00:00:00Z' },
      { id: 'v2', email: 'y@b', vendor_id: 'o2', vendor_name: 'Beta', vu_status: 'active', vendor_status: 'suspended', contract_end: '2999-01-01T00:00:00Z' },
      { id: 'v3', email: 'z@c', vendor_id: 'o3', vendor_name: 'Ok', vu_status: 'active', vendor_status: 'active', contract_end: '2999-01-01T00:00:00Z' }
    ] as any, '2026-07-24T00:00:00Z', '2026-07-24')
    expect(c.map((x) => x.actor).sort()).toEqual(['x@a', 'y@b'])
  })
})
