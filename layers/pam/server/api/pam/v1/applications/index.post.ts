import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePamPermission, pamAudit, newId, nowIso } from '~~/layers/pam/server/utils/pamStore'

/** Register an application (workload) identity holder (pam.secret.manage). */
export default defineEventHandler(async (event) => {
  const { user } = await requirePamPermission(event, 'pam.secret.manage')
  const body = await readBody(event)
  const name = String(body?.name || '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  const slug = String(body?.slug || name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const db = getPamDb()
  const dup = await db.query('SELECT 1 FROM pam.applications WHERE lower(slug)=lower($1)', [slug])
  if (dup.rows.length) throw createError({ statusCode: 409, statusMessage: `Application "${slug}" already exists` })
  const id = newId()
  await db.query(
    `INSERT INTO pam.applications (id, name, slug, description, owner, environment, created_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, name, slug, body.description || null, body.owner || null, body.environment || null, nowIso(), user.username]
  )
  await pamAudit(event, user, { action: 'application.create', objectType: 'application', objectId: id, details: { name } })
  return { id }
})
