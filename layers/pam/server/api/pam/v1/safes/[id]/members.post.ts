import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePam, assertSafePermission, pamAudit, loadOr404, newId, nowIso, withPamTx } from '~~/layers/pam/server/utils/pamStore'
import { SAFE_PERMISSIONS, defaultSafePermissions, type SafePermission } from '~~/layers/pam/server/utils/pamPolicy'

/** Add (or replace) a safe member and their granular permissions (requires manage_members). */
export default defineEventHandler(async (event) => {
  const { user, tier } = await requirePam(event, 'viewer')
  const id = getRouterParam(event, 'id')!
  await loadOr404('pam.safes', id, 'Safe not found')
  await assertSafePermission(user, tier, id, 'manage_members')
  const body = await readBody(event)

  const principalType = body?.principal_type === 'group' ? 'group' : 'user'
  const principalId = String(body?.principal_id || '').trim()
  if (!principalId) throw createError({ statusCode: 400, statusMessage: 'principal_id is required' })
  const principalName = String(body?.principal_name || principalId).trim()

  // Permissions: explicit list (validated) or a preset.
  let perms: SafePermission[]
  if (Array.isArray(body?.permissions)) {
    perms = body.permissions.filter((p: string) => (SAFE_PERMISSIONS as readonly string[]).includes(p))
  } else {
    const preset = ['reader', 'user', 'approver', 'owner'].includes(body?.preset) ? body.preset : 'user'
    perms = defaultSafePermissions(preset)
  }

  const memberId = newId()
  await withPamTx(async (client) => {
    // Replace any existing membership for this principal.
    const existing = await client.query(
      'SELECT id FROM pam.safe_members WHERE safe_id=$1 AND principal_type=$2 AND lower(principal_id)=lower($3)',
      [id, principalType, principalId]
    )
    if (existing.rows.length) {
      await client.query('DELETE FROM pam.safe_members WHERE id=$1', [existing.rows[0].id])
    }
    await client.query(
      `INSERT INTO pam.safe_members (id, safe_id, principal_type, principal_id, principal_name, source, added_at, added_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [memberId, id, principalType, principalId, principalName, body.source || (principalType === 'group' ? 'oidc' : 'local'), nowIso(), user.username]
    )
    for (const perm of perms) {
      await client.query('INSERT INTO pam.safe_member_permissions (member_id, permission) VALUES ($1,$2) ON CONFLICT DO NOTHING', [memberId, perm])
    }
  })
  await pamAudit(event, user, { action: 'safe.member.add', objectType: 'safe', objectId: id, safeId: id, severity: 'notice', details: { principalType, principalId, perms } })
  return { id: memberId }
})
