import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePamPermission, pamAudit, newId, nowIso, withPamTx } from '~~/layers/pam/server/utils/pamStore'
import { SAFE_PERMISSIONS } from '~~/layers/pam/server/utils/pamPolicy'

const CRITICALITY = ['low', 'medium', 'high', 'critical']

/** Create a safe (admin tier: pam.safe.manage). The creator becomes an owner member. */
export default defineEventHandler(async (event) => {
  const { user } = await requirePamPermission(event, 'pam.safe.manage')
  const body = await readBody(event)
  const name = String(body?.name || '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  const slug = String(body?.slug || name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'A valid slug is required' })

  const db = getPamDb()
  const dup = await db.query('SELECT 1 FROM pam.safes WHERE lower(slug)=lower($1) AND deleted_at IS NULL', [slug])
  if (dup.rows.length) throw createError({ statusCode: 409, statusMessage: `A safe with slug "${slug}" already exists` })

  const id = newId()
  const now = nowIso()
  await withPamTx(async (client) => {
    await client.query(
      `INSERT INTO pam.safes
        (id, name, slug, description, business_owner, technical_owner, department, environment,
         criticality, data_classification, retention_days, require_dual_control, created_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [id, name, slug, body.description || null, body.business_owner || null, body.technical_owner || null,
        body.department || null, body.environment || 'production',
        CRITICALITY.includes(body.criticality) ? body.criticality : 'medium',
        body.data_classification || null, Number(body.retention_days) || 365,
        body.require_dual_control === true, now, user.username]
    )
    // Creator = owner member with all granular safe permissions.
    const memberId = newId()
    await client.query(
      `INSERT INTO pam.safe_members (id, safe_id, principal_type, principal_id, principal_name, source, added_at, added_by)
       VALUES ($1,$2,'user',$3,$4,$5,$6,$3)`,
      [memberId, id, user.username, user.displayName, user.source, now]
    )
    for (const perm of SAFE_PERMISSIONS) {
      await client.query('INSERT INTO pam.safe_member_permissions (member_id, permission) VALUES ($1,$2)', [memberId, perm])
    }
  })
  await pamAudit(event, user, { action: 'safe.create', objectType: 'safe', objectId: id, safeId: id, severity: 'notice', details: { name, slug } })
  return { id }
})
