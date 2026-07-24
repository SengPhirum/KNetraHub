import type { Pool } from 'pg'
import { Client, Change, Attribute } from 'ldapts'
import { getPamDb } from '~~/server/utils/moduleDb'
import { newId, nowIso } from './pamStore'
import { appendAudit } from './pamAudit'
import { pamNotify } from './pamNotify'
import { recordRisk } from './pamRisk'
import { needsRevocation } from './pamJitCore'

/**
 * Just-in-time entitlement provider framework (spec §9). Each provider performs
 * a real target change and — critically — an independent verifyProvisioned /
 * verifyRevoked. The driver marks an entitlement `active` only after provisioned
 * is verified, and `revoked` only after removal is verified; a failed revoke
 * goes to revoke_failed + a critical risk event (never silently "revoked").
 */

export interface JitResult { ok: boolean; detail: string; evidence?: Record<string, unknown> }
export interface JitProvider {
  key: string
  provision(ent: any): Promise<JitResult>
  verifyProvisioned(ent: any): Promise<JitResult>
  revoke(ent: any): Promise<JitResult>
  verifyRevoked(ent: any): Promise<JitResult>
}

function cfg(ent: any): Record<string, any> { try { return ent.config ? (typeof ent.config === 'string' ? JSON.parse(ent.config) : ent.config) : {} } catch { return {} } }

const providers = new Map<string, JitProvider>()
export function registerJitProvider(p: JitProvider): void { providers.set(p.key, p) }
export function providerFor(ent: any): JitProvider | null { return providers.get(ent.provider || ent.entitlement_type) || null }

// ── LDAP group-membership provider (real; e.g. AD/OpenLDAP privileged groups) ──

function ldapClient(c: any): Client {
  const url: string = c.url
  if (!url) throw new Error('ldap url required')
  if (url.startsWith('ldap://') && !c.allowInsecure) throw new Error('LDAPS required (set allowInsecure for lab)')
  return new Client({ url, tlsOptions: url.startsWith('ldaps://') ? { rejectUnauthorized: c.tlsRejectUnauthorized !== false } : undefined, timeout: 12000, connectTimeout: 12000 })
}
async function ldapMembers(c: any, groupDn: string, attr: string): Promise<string[]> {
  const cl = ldapClient(c)
  try {
    await cl.bind(c.bindDn, c.bindPassword)
    const { searchEntries } = await cl.search(groupDn, { scope: 'base', attributes: [attr] })
    const v = (searchEntries[0] as any)?.[attr]
    return (Array.isArray(v) ? v : v ? [v] : []).map(String)
  } finally { await cl.unbind().catch(() => {}) }
}
async function ldapModify(c: any, groupDn: string, op: 'add' | 'delete', attr: string, value: string): Promise<void> {
  const cl = ldapClient(c)
  try {
    await cl.bind(c.bindDn, c.bindPassword)
    await cl.modify(groupDn, new Change({ operation: op, modification: new Attribute({ type: attr, values: [value] }) }))
  } finally { await cl.unbind().catch(() => {}) }
}

const ldapGroupProvider: JitProvider = {
  key: 'ldap-group',
  async provision(ent) {
    const c = cfg(ent); const attr = c.memberAttr || 'member'; const value = c.principalDn || ent.principal
    try {
      const members = await ldapMembers(c, ent.target, attr)
      if (members.map((m) => m.toLowerCase()).includes(String(value).toLowerCase())) return { ok: true, detail: 'already a member', evidence: { group: ent.target, member: value } }
      await ldapModify(c, ent.target, 'add', attr, value)
      return { ok: true, detail: `added ${value} to ${ent.target}`, evidence: { group: ent.target, member: value } }
    } catch (e: any) { return { ok: false, detail: `provision failed: ${e.message || e}` } }
  },
  async verifyProvisioned(ent) {
    const c = cfg(ent); const attr = c.memberAttr || 'member'; const value = String(c.principalDn || ent.principal).toLowerCase()
    try { const present = (await ldapMembers(c, ent.target, attr)).map((m) => m.toLowerCase()).includes(value); return { ok: present, detail: present ? 'membership confirmed' : 'not a member' } }
    catch (e: any) { return { ok: false, detail: String(e.message || e) } }
  },
  async revoke(ent) {
    const c = cfg(ent); const attr = c.memberAttr || 'member'; const value = c.principalDn || ent.principal
    try {
      const members = await ldapMembers(c, ent.target, attr)
      if (!members.map((m) => m.toLowerCase()).includes(String(value).toLowerCase())) return { ok: true, detail: 'already absent' }
      await ldapModify(c, ent.target, 'delete', attr, value)
      return { ok: true, detail: `removed ${value} from ${ent.target}`, evidence: { group: ent.target, member: value } }
    } catch (e: any) { return { ok: false, detail: `revoke failed: ${e.message || e}` } }
  },
  async verifyRevoked(ent) {
    const c = cfg(ent); const attr = c.memberAttr || 'member'; const value = String(c.principalDn || ent.principal).toLowerCase()
    try { const present = (await ldapMembers(c, ent.target, attr)).map((m) => m.toLowerCase()).includes(value); return { ok: !present, detail: present ? 'still a member' : 'removal confirmed' } }
    catch (e: any) { return { ok: false, detail: String(e.message || e) } }
  }
}
registerJitProvider(ldapGroupProvider)

// Cloud / Windows / k8s providers are EXTERNALLY CONSTRAINED (no local target).
// Registered as explicit "requires external target" so they never fake success.
for (const key of ['ad_group', 'aws_role', 'azure_role', 'gcp_role', 'k8s_rolebinding', 'k8s_clusterrolebinding', 'windows_group', 'sudo', 'db_role', 'vpn']) {
  if (providers.has(key)) continue
  registerJitProvider({
    key,
    async provision() { return { ok: false, detail: `${key} JIT requires the external target/connector (EXTERNALLY CONSTRAINED)` } },
    async verifyProvisioned() { return { ok: false, detail: 'external target not attached' } },
    async revoke() { return { ok: false, detail: `${key} JIT revocation requires the external target/connector` } },
    async verifyRevoked() { return { ok: false, detail: 'external target not attached' } }
  })
}

// ── State-machine driver ────────────────────────────────────────────────────

export interface RequestJitInput {
  entitlementType: string; provider?: string; target: string; principal: string
  config?: unknown; scope?: string | null; ttlSeconds: number; grantId?: string | null; accountId?: string | null; requestedBy?: string
}

export async function requestJit(input: RequestJitInput, db: Pool = getPamDb()): Promise<string> {
  const id = newId()
  const now = nowIso()
  await db.query(
    `INSERT INTO pam.jit_entitlements
      (id, grant_id, account_id, entitlement_type, provider, target, principal, config, scope, requested_by,
       state, provisioned, expires_at, revoke_status, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'approved',false,$11,'pending',$12)`,
    [id, input.grantId ?? null, input.accountId ?? null, input.entitlementType, input.provider ?? input.entitlementType,
      input.target, input.principal, input.config ? JSON.stringify(input.config) : null, input.scope ?? null,
      input.requestedBy ?? 'system', new Date(Date.now() + input.ttlSeconds * 1000).toISOString(), now]
  )
  return id
}

async function load(id: string, db: Pool): Promise<any> {
  const r = (await db.query('SELECT * FROM pam.jit_entitlements WHERE id=$1', [id])).rows[0]
  if (!r) throw createError({ statusCode: 404, statusMessage: 'JIT entitlement not found' })
  return r
}

/** Provision + independently verify. active on success, provision_failed otherwise. */
export async function provisionJit(id: string, db: Pool = getPamDb()): Promise<{ ok: boolean; state: string; detail: string }> {
  const ent = await load(id, db)
  const provider = providerFor(ent)
  if (!provider) return failProvision(ent, 'no JIT provider registered for ' + (ent.provider || ent.entitlement_type), db)
  await db.query("UPDATE pam.jit_entitlements SET state='provisioning' WHERE id=$1", [id])
  try {
    const r = await provider.provision(ent)
    if (!r.ok) return failProvision(ent, r.detail, db)
    const v = await provider.verifyProvisioned(ent)
    if (!v.ok) return failProvision(ent, `provisioned but verification failed: ${v.detail}`, db)
    await db.query("UPDATE pam.jit_entitlements SET state='active', provisioned=true, provisioned_at=$2, evidence=$3 WHERE id=$1",
      [id, nowIso(), JSON.stringify({ provision: r.evidence ?? null, verified: v.detail })])
    await appendAudit({ actor: ent.requested_by || 'system', action: 'jit.provisioned', objectType: 'jit', objectId: id, result: 'success', severity: 'notice', details: { type: ent.entitlement_type, target: ent.target, principal: ent.principal } }, db).catch(() => {})
    return { ok: true, state: 'active', detail: r.detail }
  } catch (e: any) { return failProvision(ent, String(e?.message || e), db) }
}

async function failProvision(ent: any, detail: string, db: Pool): Promise<{ ok: boolean; state: string; detail: string }> {
  await db.query("UPDATE pam.jit_entitlements SET state='provision_failed', last_error=$2 WHERE id=$1", [ent.id, detail])
  await recordRisk({ ruleKey: 'jit_provision_failure', accountId: ent.account_id, target: ent.target, explanation: `JIT provisioning failed for ${ent.principal} on ${ent.target}: ${detail}` }, db).catch(() => {})
  return { ok: false, state: 'provision_failed', detail }
}

/** Revoke + independently verify. revoked ONLY after verifyRevoked passes. */
export async function revokeJit(id: string, reason: string, db: Pool = getPamDb()): Promise<{ ok: boolean; state: string; detail: string }> {
  const ent = await load(id, db)
  if (ent.state === 'revoked') return { ok: true, state: 'revoked', detail: 'already revoked' }
  const provider = providerFor(ent)
  await db.query("UPDATE pam.jit_entitlements SET state='revoking', revoke_attempts=revoke_attempts+1 WHERE id=$1", [id])
  try {
    if (!provider) throw new Error('no JIT provider registered')
    const r = await provider.revoke(ent)
    const v = await provider.verifyRevoked(ent)
    if (r.ok && v.ok) {
      await db.query("UPDATE pam.jit_entitlements SET state='revoked', revoked=true, revoked_at=$2, revoke_status='revoked', evidence=COALESCE(evidence,'{}'), last_error=NULL WHERE id=$1", [id, nowIso()])
      await appendAudit({ actor: 'system', action: 'jit.revoked', objectType: 'jit', objectId: id, result: 'success', severity: 'notice', reason, details: { target: ent.target, principal: ent.principal } }, db).catch(() => {})
      return { ok: true, state: 'revoked', detail: v.detail }
    }
    return failRevoke(ent, `revoke=${r.detail}; verify=${v.detail}`, db)
  } catch (e: any) { return failRevoke(ent, String(e?.message || e), db) }
}

async function failRevoke(ent: any, detail: string, db: Pool): Promise<{ ok: boolean; state: string; detail: string }> {
  const attempts = Number(ent.revoke_attempts) + 1
  await db.query("UPDATE pam.jit_entitlements SET state='revoke_failed', revoke_status='failed', last_error=$2 WHERE id=$1", [ent.id, detail])
  await recordRisk({ ruleKey: 'jit_revoke_failure', accountId: ent.account_id, target: ent.target, severity: 'critical', explanation: `JIT revocation FAILED for ${ent.principal} on ${ent.target}: ${detail}` }, db).catch(() => {})
  if (attempts >= 3) await pamNotify({ severity: 'critical', event: 'jit.revoke_failed', title: 'JIT revocation failed', body: `Could not revoke ${ent.entitlement_type} on ${ent.target} for ${ent.principal}.`, objectType: 'jit', objectId: ent.id, link: '/pam/grants' }, db).catch(() => {})
  return { ok: false, state: 'revoke_failed', detail }
}

export async function renewJit(id: string, ttlSeconds: number, db: Pool = getPamDb()): Promise<void> {
  await db.query("UPDATE pam.jit_entitlements SET expires_at=$2, renewed_at=$3, state=CASE WHEN state='active' THEN 'active' ELSE state END WHERE id=$1",
    [id, new Date(Date.now() + ttlSeconds * 1000).toISOString(), nowIso()])
}

/** Revoke every entitlement whose window has expired (called by the scheduler). */
export async function sweepDueJit(db: Pool = getPamDb()): Promise<number> {
  const { rows } = await db.query("SELECT id, state FROM pam.jit_entitlements WHERE revoked=false AND expires_at <= $1", [nowIso()])
  let n = 0
  for (const r of rows) {
    if (!needsRevocation(r.state)) continue
    const res = await revokeJit(r.id, 'expired', db).catch(() => ({ ok: false }))
    if (res.ok) n++
  }
  return n
}

export async function listJit(db: Pool = getPamDb()): Promise<any[]> {
  return (await db.query('SELECT * FROM pam.jit_entitlements ORDER BY created_at DESC LIMIT 500')).rows
}
