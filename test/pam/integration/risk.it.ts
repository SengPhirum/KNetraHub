import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool } from 'pg'
import { nanoid } from 'nanoid'
import { migratePam } from '../../../layers/pam/server/db/migrate'
import { evaluateRiskRules } from '../../../layers/pam/server/utils/pamRiskEngine'

/**
 * Proves the risk EVALUATION ENGINE (spec §12): rules that were "defined but
 * never fired" now fire from real event sources, the same finding is recorded
 * exactly once (dedupe), a configured auto_response executes as a REAL action
 * (terminating a live session), and a disabled rule does not fire.
 */
const DSN = process.env.PAM_TEST_DATABASE_URL || 'postgres://pam:pam@localhost:55432/pam_test'
const WIDE = 5259600 // ~10y lookback so fixed off-hours timestamps are wall-clock independent
let pool: Pool
const now = () => new Date().toISOString()
const OFF_HOURS = '2026-07-25T10:00:00Z' // a Saturday → outside Mon–Fri 07:00–19:00

async function insertSession(over: Record<string, any> = {}): Promise<string> {
  const id = nanoid()
  const row = { id, principal: 'alice', started_at: OFF_HOURS, state: 'ended', source_ip: '203.0.113.5', recording_required: true, recording_status: 'stored', ...over }
  await pool.query(
    `INSERT INTO pam.sessions (id, principal, started_at, state, source_ip, recording_required, recording_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [row.id, row.principal, row.started_at, row.state, row.source_ip, row.recording_required, row.recording_status])
  return id
}
const countEvents = async (ruleKey: string, sessionId?: string) =>
  (await pool.query('SELECT count(*)::int c FROM pam.risk_events WHERE rule_key=$1' + (sessionId ? ' AND session_id=$2' : ''),
    sessionId ? [ruleKey, sessionId] : [ruleKey])).rows[0].c

beforeAll(async () => {
  pool = new Pool({ connectionString: DSN, max: 4 })
  await pool.query('SELECT 1')
  await pool.query('DROP SCHEMA IF EXISTS pam CASCADE')
  await migratePam(pool)
}, 120000)
afterAll(async () => { await pool?.end().catch(() => {}) })

describe('risk engine — detection + idempotency', () => {
  it('fires access_off_hours for an off-hours session, exactly once across repeated sweeps', async () => {
    const sid = await insertSession()
    await evaluateRiskRules(pool, { lookbackMinutes: WIDE })
    expect(await countEvents('access_off_hours', sid)).toBe(1)
    // Second sweep must NOT create a duplicate (dedupe_key).
    await evaluateRiskRules(pool, { lookbackMinutes: WIDE })
    expect(await countEvents('access_off_hours', sid)).toBe(1)
  })
})

describe('risk engine — auto-response executes a real action', () => {
  it('terminates a live session when the rule configures block_session', async () => {
    // Configure access_off_hours to block + alert.
    await pool.query(
      `INSERT INTO pam.risk_rules (id, rule_key, name, severity, enabled, auto_response, created_at)
       VALUES ($1,'access_off_hours','Off hours','high',true,$2,$3)
       ON CONFLICT (rule_key) DO UPDATE SET enabled=true, severity='high', auto_response=EXCLUDED.auto_response`,
      [nanoid(), JSON.stringify(['alert', 'block_session']), now()])
    const sid = await insertSession({ principal: 'bob', state: 'active' })

    const res = await evaluateRiskRules(pool, { lookbackMinutes: WIDE })
    expect(res.actions).toBeGreaterThanOrEqual(1)

    const sess = (await pool.query('SELECT state, termination_reason FROM pam.sessions WHERE id=$1', [sid])).rows[0]
    expect(sess.state).toBe('terminated')
    expect(sess.termination_reason).toMatch(/access_off_hours/)
    const ev = (await pool.query("SELECT auto_response_taken FROM pam.risk_events WHERE rule_key='access_off_hours' AND session_id=$1", [sid])).rows[0]
    expect(JSON.parse(ev.auto_response_taken)).toEqual(expect.arrayContaining(['alert', 'block_session(1)']))
  })
})

describe('risk engine — disabled rules do not fire', () => {
  it('skips rotation_overdue when the rule is disabled', async () => {
    await pool.query(
      `INSERT INTO pam.risk_rules (id, rule_key, name, severity, enabled, auto_response, created_at)
       VALUES ($1,'rotation_overdue','Rotation overdue','medium',false,'[]',$2)
       ON CONFLICT (rule_key) DO UPDATE SET enabled=false`, [nanoid(), now()])
    const safeId = nanoid(), acctId = nanoid()
    await pool.query("INSERT INTO pam.safes (id,name,slug,created_at) VALUES ($1,'S',$2,$3)", [safeId, `s-${safeId}`, now()])
    await pool.query(
      `INSERT INTO pam.accounts (id,name,username,safe_id,account_type,auto_managed,rotation_status,next_rotation_at,created_at)
       VALUES ($1,'ovd','svc',$2,'generic',true,'managed','2000-01-01T00:00:00Z',$3)`, [acctId, safeId, now()])
    await evaluateRiskRules(pool, { lookbackMinutes: WIDE })
    expect(await countEvents('rotation_overdue')).toBe(0)

    // Re-enable → now it fires (proving the disable was the reason, not a bug).
    await pool.query("UPDATE pam.risk_rules SET enabled=true WHERE rule_key='rotation_overdue'")
    await evaluateRiskRules(pool, { lookbackMinutes: WIDE })
    expect(await countEvents('rotation_overdue')).toBeGreaterThanOrEqual(1)
  })
})
