import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool } from 'pg'
import { migratePam } from '../../../layers/pam/server/db/migrate'
import { issueGatewayToken, verifyGatewayToken, consumeGatewayToken } from '../../../layers/pam/server/utils/pamGateway'

/**
 * Proves one-time gateway-token replay protection against a real database:
 * a token's jti is consumable exactly once; a replay or unknown jti fails.
 */
const DSN = process.env.PAM_TEST_DATABASE_URL || 'postgres://pam:pam@localhost:55432/pam_test'
let pool: Pool

beforeAll(async () => {
  pool = new Pool({ connectionString: DSN, max: 4 })
  await pool.query('SELECT 1')
  await pool.query('DROP SCHEMA IF EXISTS pam CASCADE')
  await migratePam(pool)
}, 120000)

afterAll(async () => { await pool?.end().catch(() => {}) })

describe('gateway token one-time use', () => {
  it('issues a token carrying a jti, verifiable back', async () => {
    const token = await issueGatewayToken({ sessionId: 's1', accountId: 'a1', grantId: '', protocol: 'ssh', user: 'alice' }, 300, pool)
    const claims = await verifyGatewayToken(token)
    expect(claims?.sessionId).toBe('s1')
    expect(claims?.jti).toBeTruthy()
    const row = (await pool.query('SELECT * FROM pam.gateway_tokens WHERE jti=$1', [claims!.jti])).rows[0]
    expect(row).toBeTruthy()
    expect(row.consumed_at).toBeNull()
  })

  it('consumes the jti exactly once (replay is rejected)', async () => {
    const token = await issueGatewayToken({ sessionId: 's2', accountId: 'a2', grantId: '', protocol: 'ssh', user: 'bob' }, 300, pool)
    const { jti } = (await verifyGatewayToken(token))!
    expect(await consumeGatewayToken(jti, 'gateway:checkout', pool)).toBe(true)
    expect(await consumeGatewayToken(jti, 'gateway:checkout', pool)).toBe(false) // replay
    const row = (await pool.query('SELECT consumed_at, consumed_by FROM pam.gateway_tokens WHERE jti=$1', [jti])).rows[0]
    expect(row.consumed_at).toBeTruthy()
    expect(row.consumed_by).toBe('gateway:checkout')
  })

  it('rejects an unknown jti', async () => {
    expect(await consumeGatewayToken('00000000-0000-0000-0000-000000000000', 'x', pool)).toBe(false)
    expect(await consumeGatewayToken(undefined, 'x', pool)).toBe(false)
  })
})
