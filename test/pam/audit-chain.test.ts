import { describe, it, expect } from 'vitest'
import { canonicalizeEvent, computeEventHash, verifyChain } from '../../layers/pam/server/utils/pamAudit'

// Build a valid hash-chained sequence the way appendAudit does: each event's
// hash covers its canonical fields + the previous event's hash.
function buildChain(n: number) {
  const rows: any[] = []
  let prev: string | null = null
  for (let i = 0; i < n; i++) {
    const e = {
      id: `evt-${i}`, ts: `2026-07-2${i % 9}T10:0${i % 9}:00Z`, actor: `user${i}`,
      action: `action.${i}`, object_type: 'account', object_id: `acc-${i}`,
      result: 'success', reason: null, ticket: null, details: JSON.stringify({ i })
    }
    const hash = computeEventHash(canonicalizeEvent(e), prev)
    rows.push({ ...e, prev_hash: prev, hash })
    prev = hash
  }
  return rows
}

describe('PAM audit hash chain', () => {
  it('computeEventHash is deterministic and chains on the previous hash', () => {
    const canon = canonicalizeEvent({ id: 'a', ts: 't', actor: 'u', action: 'x', result: 'success' })
    expect(computeEventHash(canon, null)).toBe(computeEventHash(canon, null))
    expect(computeEventHash(canon, null)).not.toBe(computeEventHash(canon, 'prev'))
  })

  it('verifies an intact chain', () => {
    const rows = buildChain(20)
    const result = verifyChain(rows)
    expect(result.ok).toBe(true)
    expect(result.brokenAt).toBeNull()
  })

  it('detects a mutated event payload (DBA edit)', () => {
    const rows = buildChain(20)
    rows[10]!.action = 'action.tampered' // change payload but leave the stored hash
    const result = verifyChain(rows)
    expect(result.ok).toBe(false)
    expect(result.brokenAt).toBe('evt-10')
    expect(result.index).toBe(10)
  })

  it('detects a deleted event (broken prev_hash linkage)', () => {
    const rows = buildChain(20)
    rows.splice(10, 1) // remove event 10; event 11 now links to the wrong prev
    const result = verifyChain(rows)
    expect(result.ok).toBe(false)
    expect(result.brokenAt).toBe('evt-11')
  })

  it('detects a re-signed row whose stored hash was recomputed but chain broke', () => {
    const rows = buildChain(20)
    // Attacker edits event 5 AND recomputes its hash, but cannot recompute the
    // rest of the chain without the whole tail — event 6 no longer links.
    rows[5]!.action = 'sneaky'
    rows[5]!.hash = computeEventHash(canonicalizeEvent(rows[5]!), rows[5]!.prev_hash)
    const result = verifyChain(rows)
    expect(result.ok).toBe(false)
    expect(result.brokenAt).toBe('evt-6')
  })
})
