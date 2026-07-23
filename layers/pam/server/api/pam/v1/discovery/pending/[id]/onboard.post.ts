import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePamPermission, assertSafePermission, pamAudit, loadOr404, newId, nowIso } from '~~/layers/pam/server/utils/pamStore'

/** Onboard a discovered account into a safe (operator: pam.discovery.run + add_account). */
export default defineEventHandler(async (event) => {
  const { user, tier } = await requirePamPermission(event, 'pam.discovery.run')
  const id = getRouterParam(event, 'id')!
  const discovered = await loadOr404<any>('pam.discovered_accounts', id, 'Discovered account not found')
  if (discovered.status !== 'pending') throw createError({ statusCode: 409, statusMessage: `Already ${discovered.status}` })
  const body = await readBody(event)
  const safeId = String(body?.safe_id || '').trim()
  if (!safeId) throw createError({ statusCode: 400, statusMessage: 'safe_id is required' })
  await loadOr404('pam.safes', safeId, 'Safe not found')
  await assertSafePermission(user, tier, safeId, 'add_account')

  const db = getPamDb()
  const accountId = newId()
  await db.query(
    `INSERT INTO pam.accounts (id, name, username, address, safe_id, platform_id, account_type, privilege_level, discovery_source, enabled, created_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10,$11)`,
    [accountId, `${discovered.username}@${discovered.address || 'discovered'}`, discovered.username, discovered.address,
      safeId, body.platform_id || null, discovered.account_type || 'generic', discovered.privilege_level || null,
      'discovery', nowIso(), user.username]
  )
  await db.query("UPDATE pam.discovered_accounts SET status='onboarded', onboarded_account_id=$2 WHERE id=$1", [id, accountId])
  await pamAudit(event, user, { action: 'discovery.onboard', objectType: 'account', objectId: accountId, safeId, severity: 'notice', details: { discoveredId: id } })
  return { accountId }
})
