import { createHash } from 'node:crypto'
import { nanoid } from 'nanoid'
import type { Pool } from 'pg'
import { getPamDb } from '~~/server/utils/moduleDb'
import { activeKeyVersion, integritySignature, verifyIntegrity, redact } from './pamCrypto'

/**
 * PAM's own tamper-evident audit trail (pam.audit_events), separate from and in
 * addition to the portal activity/audit tables. Each event's hash covers its
 * canonical fields plus the previous event's hash (hash chaining); periodic
 * signed checkpoints anchor ranges. A DBA who edits or deletes a row breaks the
 * chain, which the verification job detects. Sensitive values never enter the
 * payload — details is redacted before storage.
 */

export type AuditSeverity = 'info' | 'notice' | 'warning' | 'high' | 'critical'

export interface AuditInput {
  actor: string
  actorSource?: string | null
  effectivePermissions?: string[] | null
  sourceIp?: string | null
  userAgent?: string | null
  action: string
  objectType?: string | null
  objectId?: string | null
  safeId?: string | null
  requestId?: string | null
  sessionId?: string | null
  result?: 'success' | 'failure' | 'denied'
  reason?: string | null
  ticket?: string | null
  severity?: AuditSeverity
  details?: unknown
}

/** Canonical, order-stable serialization of the hashed fields. */
export function canonicalizeEvent(e: {
  id: string; ts: string; actor: string; action: string
  object_type?: string | null; object_id?: string | null; result: string
  reason?: string | null; ticket?: string | null; details?: string | null
}): string {
  return JSON.stringify([
    e.id, e.ts, e.actor, e.action, e.object_type ?? '', e.object_id ?? '',
    e.result, e.reason ?? '', e.ticket ?? '', e.details ?? ''
  ])
}

/** hash = SHA-256(canonical || prevHash). Pure — exported for unit tests. */
export function computeEventHash(canonical: string, prevHash: string | null): string {
  return createHash('sha256').update(canonical).update('|').update(prevHash ?? 'GENESIS').digest('hex')
}

interface ChainRow {
  id: string; ts: string; actor: string; action: string
  object_type?: string | null; object_id?: string | null; result: string
  reason?: string | null; ticket?: string | null; details?: string | null
  prev_hash: string | null; hash: string; seq?: number
}

/**
 * Recompute the chain over ordered rows; returns the first break or null if
 * intact. Pure — the verification job feeds it rows ordered by seq.
 */
export function verifyChain(rows: ChainRow[]): { ok: boolean; brokenAt: string | null; index: number } {
  let prev: string | null = null
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    const expected = computeEventHash(canonicalizeEvent(row), prev)
    if (row.prev_hash !== prev || row.hash !== expected) {
      return { ok: false, brokenAt: row.id, index: i }
    }
    prev = row.hash
  }
  return { ok: true, brokenAt: null, index: -1 }
}

/**
 * Append an event to the hash chain. Serializes concurrent appends with a
 * transaction-scoped advisory lock so prev_hash always links the true tail.
 * Failure to write audit must never silently drop the event — callers should
 * treat a throw as fatal for the audited action.
 */
export async function appendAudit(input: AuditInput, db: Pool = getPamDb()): Promise<{ id: string; hash: string }> {
  const id = nanoid()
  const ts = new Date().toISOString()
  const detailsRaw = input.details === undefined || input.details === null
    ? null
    : typeof input.details === 'string' ? input.details : JSON.stringify(input.details)
  const details = detailsRaw === null ? null : redact(detailsRaw)
  const result = input.result ?? 'success'
  const keyVersion = activeKeyVersion()

  const client = await db.connect()
  try {
    await client.query('BEGIN')
    await client.query("SELECT pg_advisory_xact_lock(hashtext('pam.audit.append'))")
    const { rows } = await client.query('SELECT hash FROM pam.audit_events ORDER BY seq DESC LIMIT 1')
    const prevHash: string | null = rows[0]?.hash ?? null
    const canonical = canonicalizeEvent({
      id, ts, actor: input.actor, action: input.action,
      object_type: input.objectType, object_id: input.objectId,
      result, reason: input.reason, ticket: input.ticket, details
    })
    const hash = computeEventHash(canonical, prevHash)
    await client.query(
      `INSERT INTO pam.audit_events
        (id, ts, actor, actor_source, effective_permissions, source_ip, user_agent, action,
         object_type, object_id, safe_id, request_id, session_id, result, reason, ticket,
         severity, details, prev_hash, hash, signing_key_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
      [
        id, ts, input.actor, input.actorSource ?? null,
        input.effectivePermissions ? JSON.stringify(input.effectivePermissions) : null,
        input.sourceIp ?? null, input.userAgent ?? null, input.action,
        input.objectType ?? null, input.objectId ?? null, input.safeId ?? null,
        input.requestId ?? null, input.sessionId ?? null, result,
        input.reason ?? null, input.ticket ?? null, input.severity ?? 'info',
        details, prevHash, hash, keyVersion
      ]
    )
    await client.query('COMMIT')
    return { id, hash }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

/** Create a signed checkpoint over all events since the last checkpoint. */
export async function createCheckpoint(actor: string, db: Pool = getPamDb()): Promise<{ id: string; count: number } | null> {
  const { rows: lastCkpt } = await db.query('SELECT seq_to FROM pam.audit_checkpoints ORDER BY seq_to DESC LIMIT 1')
  const from = Number(lastCkpt[0]?.seq_to ?? 0)
  const { rows } = await db.query(
    'SELECT seq, hash FROM pam.audit_events WHERE seq > $1 ORDER BY seq ASC', [from]
  )
  if (!rows.length) return null
  const seqTo = Number(rows[rows.length - 1]!.seq)
  const chainHash = createHash('sha256')
  for (const r of rows) chainHash.update(String(r.hash))
  const digest = chainHash.digest('hex')
  const signature = integritySignature(digest)
  const id = nanoid()
  await db.query(
    `INSERT INTO pam.audit_checkpoints
      (id, seq_from, seq_to, event_count, ts, chain_hash, signature, signing_key_version, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id, from + 1, seqTo, rows.length, new Date().toISOString(), digest, signature, activeKeyVersion(), actor]
  )
  return { id, count: rows.length }
}

export interface IntegrityReport {
  ok: boolean
  totalEvents: number
  brokenAt: string | null
  checkpointsChecked: number
  checkpointsFailed: number
  checkedAt: string
}

/** Full integrity verification: recompute the chain and re-verify checkpoints. */
export async function verifyAuditIntegrity(db: Pool = getPamDb()): Promise<IntegrityReport> {
  const { rows } = await db.query(
    `SELECT id, ts, actor, action, object_type, object_id, result, reason, ticket, details, prev_hash, hash, seq
     FROM pam.audit_events ORDER BY seq ASC`
  )
  const chain = verifyChain(rows as ChainRow[])

  const { rows: ckpts } = await db.query('SELECT id, chain_hash, signature FROM pam.audit_checkpoints ORDER BY seq_to ASC')
  let failed = 0
  for (const c of ckpts) {
    if (!verifyIntegrity(String(c.chain_hash), String(c.signature))) failed++
  }

  return {
    ok: chain.ok && failed === 0,
    totalEvents: rows.length,
    brokenAt: chain.brokenAt,
    checkpointsChecked: ckpts.length,
    checkpointsFailed: failed,
    checkedAt: new Date().toISOString()
  }
}
