import type { Pool } from 'pg'
import { createHash, randomBytes } from 'node:crypto'
import { getPamDb } from '~~/server/utils/moduleDb'
import { newId, nowIso } from './pamStore'
import { appendAudit } from './pamAudit'
import { vendorAccessVerdict } from './pamVendorCore'

/**
 * External vendor access (spec §10): vendor organizations, invitations (hashed
 * one-time token), temporary vendor-user identities, contract-window enforcement
 * and automatic suspension. Vendor users NEVER receive target passwords — access
 * is brokered browser-only through the session layer, which consults checkAccess.
 */

function j(v: unknown): string | null { return v == null ? null : (typeof v === 'string' ? v : JSON.stringify(v)) }
function arr(raw: unknown): string[] { if (!raw) return []; try { const v = typeof raw === 'string' ? JSON.parse(raw) : raw; return Array.isArray(v) ? v.map(String) : [] } catch { return [] } }

export async function createOrg(input: { name: string; sponsor?: string; contractStart?: string | null; contractEnd?: string | null; allowedCountries?: unknown; allowedNetworks?: unknown; actor?: string }, db: Pool = getPamDb()): Promise<string> {
  const id = newId()
  await db.query(
    `INSERT INTO pam.vendors (id, name, sponsor, contract_start, contract_end, allowed_countries, allowed_networks, status, created_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'active',$8,$9)`,
    [id, input.name, input.sponsor ?? null, input.contractStart ?? null, input.contractEnd ?? null, j(input.allowedCountries), j(input.allowedNetworks), nowIso(), input.actor ?? 'system']
  )
  return id
}

export async function listOrgs(db: Pool = getPamDb()): Promise<any[]> {
  return (await db.query('SELECT * FROM pam.vendors ORDER BY created_at DESC')).rows
}

export async function suspendOrg(id: string, reason: string, db: Pool = getPamDb()): Promise<void> {
  await db.query("UPDATE pam.vendors SET status='suspended', updated_at=$2 WHERE id=$1", [id, nowIso()])
  await db.query("UPDATE pam.vendor_users SET status='suspended' WHERE vendor_id=$1 AND status='active'", [id])
  await appendAudit({ actor: 'system', action: 'vendor.suspend', objectType: 'vendor', objectId: id, result: 'success', severity: 'warning', reason }, db).catch(() => {})
}

/** Invite a vendor user. Returns the clear token ONCE (only its hash is stored). */
export async function invite(vendorId: string, email: string, ttlSeconds: number, actor: string, db: Pool = getPamDb()): Promise<{ invitationId: string; token: string }> {
  const token = 'vinv_' + randomBytes(24).toString('base64url')
  const id = newId()
  await db.query(
    `INSERT INTO pam.vendor_invitations (id, vendor_id, email, token_hash, status, expires_at, created_at, created_by)
     VALUES ($1,$2,$3,$4,'sent',$5,$6,$7)`,
    [id, vendorId, email.toLowerCase(), createHash('sha256').update(token).digest('hex'), new Date(Date.now() + ttlSeconds * 1000).toISOString(), nowIso(), actor]
  )
  return { invitationId: id, token }
}

/** Accept an invitation → create a temporary vendor-user identity. */
export async function acceptInvitation(token: string, meta: { displayName?: string; mfaVerified?: boolean; termsAccepted?: boolean }, db: Pool = getPamDb()): Promise<{ vendorUserId: string }> {
  const hash = createHash('sha256').update(String(token || '')).digest('hex')
  const inv = (await db.query("SELECT * FROM pam.vendor_invitations WHERE token_hash=$1", [hash])).rows[0]
  if (!inv || inv.status !== 'sent') throw createError({ statusCode: 400, statusMessage: 'Invitation is invalid or already used' })
  if (Date.parse(inv.expires_at) < Date.now()) throw createError({ statusCode: 400, statusMessage: 'Invitation has expired' })
  if (!meta.termsAccepted) throw createError({ statusCode: 400, statusMessage: 'Terms must be accepted' })
  const vendor = (await db.query('SELECT contract_end FROM pam.vendors WHERE id=$1', [inv.vendor_id])).rows[0]
  const id = newId()
  await db.query(
    `INSERT INTO pam.vendor_users (id, vendor_id, email, display_name, status, mfa_verified, terms_accepted_at, expires_at, created_at)
     VALUES ($1,$2,$3,$4,'active',$5,$6,$7,$8)`,
    [id, inv.vendor_id, inv.email, meta.displayName ?? inv.email, !!meta.mfaVerified, nowIso(), vendor?.contract_end ?? null, nowIso()]
  )
  await db.query("UPDATE pam.vendor_invitations SET status='accepted', accepted_at=$2 WHERE id=$1", [inv.id, nowIso()])
  return { vendorUserId: id }
}

/** Enforce vendor access at connect time (contract/status/network). */
export async function checkAccess(vendorUserId: string, opts: { ip?: string | null } = {}, db: Pool = getPamDb()): Promise<{ allowed: boolean; reason: string }> {
  const u = (await db.query('SELECT * FROM pam.vendor_users WHERE id=$1', [vendorUserId])).rows[0]
  if (!u) return { allowed: false, reason: 'vendor user not found' }
  const v = (await db.query('SELECT * FROM pam.vendors WHERE id=$1', [u.vendor_id])).rows[0]
  if (!v) return { allowed: false, reason: 'vendor organization not found' }
  return vendorAccessVerdict({
    vendorStatus: v.status, contractStart: v.contract_start, contractEnd: v.contract_end,
    userStatus: u.status, userExpiry: u.expires_at, allowedNetworks: arr(v.allowed_networks), ip: opts.ip ?? null
  })
}

/** Auto-suspend vendors whose contract has expired (scheduler). */
export async function autoSuspendExpired(db: Pool = getPamDb()): Promise<number> {
  const now = nowIso()
  const expired = (await db.query("SELECT id FROM pam.vendors WHERE status='active' AND contract_end IS NOT NULL AND contract_end < $1", [now])).rows
  for (const v of expired) {
    await db.query("UPDATE pam.vendors SET status='expired', updated_at=$2 WHERE id=$1", [v.id, now])
    await db.query("UPDATE pam.vendor_users SET status='expired' WHERE vendor_id=$1 AND status IN ('active','invited')", [v.id])
    await appendAudit({ actor: 'system', action: 'vendor.auto_expire', objectType: 'vendor', objectId: v.id, result: 'success', severity: 'warning', reason: 'contract expired' }, db).catch(() => {})
  }
  return expired.length
}
