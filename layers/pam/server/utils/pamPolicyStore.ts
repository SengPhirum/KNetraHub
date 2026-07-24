import type { Pool } from 'pg'
import { getPamDb } from '~~/server/utils/moduleDb'
import { newId, nowIso } from './pamStore'

/**
 * Access-policy CRUD + versioning. Replaces the read-only policy surface: an
 * admin can create/edit/delete policies and their approval levels; every write
 * bumps the policy version and snapshots the full definition into
 * pam.access_policy_versions for audit + rollback reference.
 */

export interface PolicyLevelInput { level: number; approverType: string; approverRef?: string | null; quorum?: number; timeoutMinutes?: number | null; ordering?: number }
export interface PolicyInput {
  name: string; description?: string | null; approvalType?: string
  requireTicket?: boolean; requireMfa?: boolean; requireRecording?: boolean; allowSelfApproval?: boolean
  maxDurationMinutes?: number; maxConcurrentSessions?: number; maxUseCount?: number | null
  allowedProtocols?: unknown; allowedSourceNetworks?: unknown; allowedHours?: unknown; separationOfDuties?: unknown
  enabled?: boolean; actor?: string
}

function j(v: unknown): string | null { return v == null ? null : (typeof v === 'string' ? v : JSON.stringify(v)) }

async function replaceRules(policyId: string, levels: PolicyLevelInput[] | undefined, db: Pool): Promise<void> {
  await db.query('DELETE FROM pam.access_policy_rules WHERE policy_id=$1', [policyId])
  for (const [i, l] of (levels || []).entries()) {
    await db.query(
      'INSERT INTO pam.access_policy_rules (id, policy_id, level, approver_type, approver_ref, quorum, timeout_minutes, ordering) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [newId(), policyId, Number(l.level) || 1, l.approverType || 'manager', l.approverRef ?? null, Math.max(1, Number(l.quorum) || 1), l.timeoutMinutes ?? null, Number(l.ordering) || i]
    )
  }
}

async function snapshot(policyId: string, actor: string, db: Pool): Promise<void> {
  const p = (await db.query('SELECT * FROM pam.access_policies WHERE id=$1', [policyId])).rows[0]
  if (!p) return
  const rules = (await db.query('SELECT level, approver_type, approver_ref, quorum, timeout_minutes, ordering FROM pam.access_policy_rules WHERE policy_id=$1 ORDER BY level, ordering', [policyId])).rows
  await db.query(
    'INSERT INTO pam.access_policy_versions (id, policy_id, version, definition, created_at, created_by) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (policy_id, version) DO NOTHING',
    [newId(), policyId, p.version, JSON.stringify({ policy: p, rules }), nowIso(), actor]
  )
}

export async function listPolicies(db: Pool = getPamDb()): Promise<any[]> {
  return (await db.query('SELECT * FROM pam.access_policies ORDER BY name')).rows
}

export async function getPolicy(id: string, db: Pool = getPamDb()): Promise<any | null> {
  const p = (await db.query('SELECT * FROM pam.access_policies WHERE id=$1', [id])).rows[0]
  if (!p) return null
  const rules = (await db.query('SELECT * FROM pam.access_policy_rules WHERE policy_id=$1 ORDER BY level, ordering', [id])).rows
  return { ...p, rules }
}

export async function createPolicy(input: PolicyInput & { levels?: PolicyLevelInput[] }, db: Pool = getPamDb()): Promise<string> {
  const id = newId()
  const now = nowIso()
  await db.query(
    `INSERT INTO pam.access_policies
      (id, name, description, approval_type, require_ticket, require_mfa, require_recording, allow_self_approval,
       max_duration_minutes, max_concurrent_sessions, max_use_count, allowed_protocols, allowed_source_networks,
       allowed_hours, separation_of_duties, enabled, version, created_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,1,$17,$18)`,
    [id, input.name, input.description ?? null, input.approvalType ?? 'one', !!input.requireTicket, !!input.requireMfa,
      input.requireRecording !== false, !!input.allowSelfApproval, Number(input.maxDurationMinutes) || 240,
      Number(input.maxConcurrentSessions) || 1, input.maxUseCount ?? null, j(input.allowedProtocols), j(input.allowedSourceNetworks),
      j(input.allowedHours), j(input.separationOfDuties), input.enabled !== false, now, input.actor ?? 'system']
  )
  await replaceRules(id, (input as any).levels, db)
  await snapshot(id, input.actor ?? 'system', db)
  return id
}

export async function updatePolicy(id: string, input: PolicyInput & { levels?: PolicyLevelInput[] }, db: Pool = getPamDb()): Promise<void> {
  const cur = (await db.query('SELECT * FROM pam.access_policies WHERE id=$1', [id])).rows[0]
  if (!cur) throw createError({ statusCode: 404, statusMessage: 'Policy not found' })
  await db.query(
    `UPDATE pam.access_policies SET name=$2, description=$3, approval_type=$4, require_ticket=$5, require_mfa=$6,
      require_recording=$7, allow_self_approval=$8, max_duration_minutes=$9, max_concurrent_sessions=$10, max_use_count=$11,
      allowed_protocols=$12, allowed_source_networks=$13, allowed_hours=$14, separation_of_duties=$15, enabled=$16,
      version=version+1, updated_at=$17, updated_by=$18 WHERE id=$1`,
    [id, input.name ?? cur.name, input.description ?? cur.description, input.approvalType ?? cur.approval_type,
      input.requireTicket ?? cur.require_ticket, input.requireMfa ?? cur.require_mfa, input.requireRecording ?? cur.require_recording,
      input.allowSelfApproval ?? cur.allow_self_approval, input.maxDurationMinutes ?? cur.max_duration_minutes,
      input.maxConcurrentSessions ?? cur.max_concurrent_sessions, input.maxUseCount !== undefined ? input.maxUseCount : cur.max_use_count,
      input.allowedProtocols !== undefined ? j(input.allowedProtocols) : cur.allowed_protocols,
      input.allowedSourceNetworks !== undefined ? j(input.allowedSourceNetworks) : cur.allowed_source_networks,
      input.allowedHours !== undefined ? j(input.allowedHours) : cur.allowed_hours,
      input.separationOfDuties !== undefined ? j(input.separationOfDuties) : cur.separation_of_duties,
      input.enabled ?? cur.enabled, nowIso(), input.actor ?? 'system']
  )
  if ((input as any).levels !== undefined) await replaceRules(id, (input as any).levels, db)
  await snapshot(id, input.actor ?? 'system', db)
}

export async function deletePolicy(id: string, db: Pool = getPamDb()): Promise<void> {
  // Detach from any safes first so the FK (ON DELETE SET NULL) is explicit.
  await db.query('UPDATE pam.safes SET approval_policy_id=NULL WHERE approval_policy_id=$1', [id])
  await db.query('DELETE FROM pam.access_policies WHERE id=$1', [id])
}

export async function listPolicyVersions(id: string, db: Pool = getPamDb()): Promise<any[]> {
  return (await db.query('SELECT id, version, created_at, created_by FROM pam.access_policy_versions WHERE policy_id=$1 ORDER BY version DESC', [id])).rows
}
