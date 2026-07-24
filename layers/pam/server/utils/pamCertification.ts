import type { Pool } from 'pg'
import { getPamDb } from '~~/server/utils/moduleDb'
import { newId, nowIso } from './pamStore'
import { appendAudit } from './pamAudit'
import { pamNotify } from './pamNotify'
import { tallyItems, deriveStatus, itemsFromRows, isValidDecision, type CampaignScope } from './pamCertificationCore'

/**
 * Stage 8 — access-certification campaigns (spec §11). A campaign snapshots a
 * set of privileged access subjects (active grants, privileged accounts, live
 * JIT entitlements, safe members). Reviewers certify or REVOKE each item; a
 * revoke performs the real enforcement (revoke the grant/entitlement, disable
 * the account, or remove the safe membership) and the campaign completes with a
 * stored evidence summary once every item is decided.
 */

type ScopeBuilder = (scope: any) => { sql: string; params: any[] }
const SCOPE_SQL: Record<string, ScopeBuilder> = {
  active_grants: () => ({
    sql: `SELECT g.id, g.grantee, g.action, a.name AS account_name, g.account_id
            FROM pam.access_grants g LEFT JOIN pam.accounts a ON a.id = g.account_id
           WHERE g.status = 'active' ORDER BY g.created_at DESC`,
    params: []
  }),
  privileged_accounts: () => ({
    sql: `SELECT a.id, a.name, a.criticality, s.name AS safe_name, a.safe_id
            FROM pam.accounts a LEFT JOIN pam.safes s ON s.id = a.safe_id
           WHERE a.deleted_at IS NULL AND a.criticality IN ('high','critical') ORDER BY a.name`,
    params: []
  }),
  jit_entitlements: () => ({
    sql: `SELECT id, principal, entitlement_type, target FROM pam.jit_entitlements WHERE revoked = false ORDER BY created_at DESC`,
    params: []
  }),
  safe_members: (scope) => ({
    sql: `SELECT id, principal_name AS principal, principal_type AS role FROM pam.safe_members WHERE safe_id = $1 ORDER BY added_at`,
    params: [scope.safeId]
  })
}

export interface CreateCampaignInput {
  name: string
  scope: CampaignScope
  reviewer?: string | null
  dueDate?: string | null
  actor: string
}

export async function createCampaign(input: CreateCampaignInput, db: Pool = getPamDb()): Promise<{ id: string; itemCount: number }> {
  const builder = SCOPE_SQL[input.scope?.type]
  if (!builder) throw new Error(`unknown certification scope: ${input.scope?.type}`)
  const id = newId()
  const created = nowIso()
  await db.query(
    `INSERT INTO pam.certification_campaigns (id, name, scope, reviewer, due_date, status, created_at, created_by)
     VALUES ($1,$2,$3,$4,$5,'open',$6,$7)`,
    [id, input.name, JSON.stringify(input.scope), input.reviewer ?? null, input.dueDate ?? null, created, input.actor]
  )
  const { sql, params } = builder(input.scope)
  const rows = (await db.query(sql, params)).rows
  const items = itemsFromRows(input.scope, rows)
  for (const it of items) {
    await db.query(
      `INSERT INTO pam.certification_items (id, campaign_id, subject_type, subject_id, subject_label, decision) VALUES ($1,$2,$3,$4,$5,'pending')`,
      [newId(), id, it.subjectType, it.subjectId, it.subjectLabel]
    )
  }
  await appendAudit({ actor: input.actor, action: 'certification.create', objectType: 'certification', objectId: id,
    result: 'success', severity: 'notice', reason: `${input.name}: ${items.length} items (${input.scope.type})` }, db).catch(() => {})
  return { id, itemCount: items.length }
}

export async function listCampaigns(db: Pool = getPamDb()): Promise<any[]> {
  const { rows } = await db.query(
    `SELECT c.*, COALESCE(i.total,0)::int AS total,
            COALESCE(i.pending,0)::int AS pending, COALESCE(i.certified,0)::int AS certified,
            COALESCE(i.revoked,0)::int AS revoked, COALESCE(i.delegated,0)::int AS delegated
       FROM pam.certification_campaigns c
       LEFT JOIN (
         SELECT campaign_id, count(*) AS total,
           count(*) FILTER (WHERE decision='pending') AS pending,
           count(*) FILTER (WHERE decision='certified') AS certified,
           count(*) FILTER (WHERE decision='revoked') AS revoked,
           count(*) FILTER (WHERE decision='delegated') AS delegated
         FROM pam.certification_items GROUP BY campaign_id
       ) i ON i.campaign_id = c.id
      ORDER BY c.created_at DESC`)
  return rows
}

export async function getCampaign(id: string, db: Pool = getPamDb()): Promise<any | null> {
  const c = (await db.query('SELECT * FROM pam.certification_campaigns WHERE id=$1', [id])).rows[0]
  if (!c) return null
  const items = (await db.query('SELECT * FROM pam.certification_items WHERE campaign_id=$1 ORDER BY subject_label', [id])).rows
  return { ...c, counts: tallyItems(items), items }
}

/** Enforce a revoke decision as a real action against the underlying subject. */
async function enforceRevoke(subjectType: string, subjectId: string, actor: string, db: Pool): Promise<string> {
  const ts = nowIso()
  if (subjectType === 'grant') {
    await db.query("UPDATE pam.access_grants SET status='revoked', revoked_by=$2, revoked_at=$3, revoke_reason='certification revoke' WHERE id=$1 AND status='active'", [subjectId, actor, ts])
    await db.query("UPDATE pam.sessions SET state='terminated', ended_at=$2, termination_reason='certification revoke' WHERE grant_id=$1 AND state IN ('starting','active','idle')", [subjectId, ts])
    return 'grant revoked + sessions terminated'
  }
  if (subjectType === 'jit') {
    await db.query("UPDATE pam.jit_entitlements SET revoked=true, revoked_at=$2, revoke_status='revoked' WHERE id=$1 AND revoked=false", [subjectId, ts])
    return 'JIT entitlement revoked'
  }
  if (subjectType === 'account') {
    await db.query('UPDATE pam.accounts SET enabled=false, updated_at=$2 WHERE id=$1 AND deleted_at IS NULL', [subjectId, ts])
    return 'account disabled'
  }
  if (subjectType === 'safe_member') {
    await db.query('DELETE FROM pam.safe_members WHERE id=$1', [subjectId])
    return 'safe membership removed'
  }
  return 'no-op'
}

export interface DecideInput { decision: string; comment?: string | null; reviewer: string }

export async function decideItem(campaignId: string, itemId: string, input: DecideInput, db: Pool = getPamDb()): Promise<{ campaignStatus: string; enforcement?: string }> {
  if (!isValidDecision(input.decision)) throw new Error('decision must be certified, revoked, or delegated')
  const item = (await db.query('SELECT * FROM pam.certification_items WHERE id=$1 AND campaign_id=$2', [itemId, campaignId])).rows[0]
  if (!item) throw new Error('certification item not found')

  let enforcement: string | undefined
  if (input.decision === 'revoked') {
    enforcement = await enforceRevoke(item.subject_type, item.subject_id, input.reviewer, db)
  }
  await db.query(
    'UPDATE pam.certification_items SET decision=$2, comment=$3, reviewer=$4, decided_at=$5 WHERE id=$1',
    [itemId, input.decision, input.comment ?? null, input.reviewer, nowIso()]
  )
  await appendAudit({ actor: input.reviewer, action: 'certification.decide', objectType: 'certification_item', objectId: itemId,
    result: 'success', severity: input.decision === 'revoked' ? 'warning' : 'notice',
    reason: `${item.subject_label}: ${input.decision}${enforcement ? ` (${enforcement})` : ''}` }, db).catch(() => {})

  const campaignStatus = await recompute(campaignId, db)
  return { campaignStatus, enforcement }
}

/** Recompute counts + status; finalize with an evidence summary when complete. */
async function recompute(campaignId: string, db: Pool = getPamDb()): Promise<string> {
  const c = (await db.query('SELECT status, due_date, completed_at FROM pam.certification_campaigns WHERE id=$1', [campaignId])).rows[0]
  if (!c) return 'open'
  const items = (await db.query('SELECT decision FROM pam.certification_items WHERE campaign_id=$1', [campaignId])).rows
  const counts = tallyItems(items)
  const status = deriveStatus(counts, c.due_date, nowIso())
  if (status === 'completed' && !c.completed_at) {
    await db.query('UPDATE pam.certification_campaigns SET status=$2, completed_at=$3, summary=$4 WHERE id=$1',
      [campaignId, status, nowIso(), JSON.stringify(counts)])
    await pamNotify({ severity: 'info', event: 'certification.completed', title: 'Certification campaign completed',
      body: `Reviewed ${counts.total} items — ${counts.certified} certified, ${counts.revoked} revoked.`, objectType: 'certification', objectId: campaignId, link: '/pam/certifications' }, db).catch(() => {})
  } else {
    await db.query('UPDATE pam.certification_campaigns SET status=$2 WHERE id=$1', [campaignId, status])
  }
  return status
}
