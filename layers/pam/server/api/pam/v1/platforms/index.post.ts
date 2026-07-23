import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePamPermission, pamAudit, newId, nowIso } from '~~/layers/pam/server/utils/pamStore'
import { getConnector } from '~~/layers/pam/server/connectors/registry'

/** Create a platform (admin tier: pam.platform.manage). */
export default defineEventHandler(async (event) => {
  const { user } = await requirePamPermission(event, 'pam.platform.manage')
  const body = await readBody(event)
  const name = String(body?.name || '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  const slug = String(body?.slug || name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const baseType = String(body?.base_type || 'generic')
  const connectorKey = body?.connector_key ? String(body.connector_key) : null
  if (connectorKey && !getConnector(connectorKey)) throw createError({ statusCode: 400, statusMessage: `Unknown connector: ${connectorKey}` })

  const db = getPamDb()
  const dup = await db.query('SELECT 1 FROM pam.platforms WHERE lower(slug)=lower($1)', [slug])
  if (dup.rows.length) throw createError({ statusCode: 409, statusMessage: `Platform "${slug}" already exists` })

  const id = newId()
  await db.query(
    `INSERT INTO pam.platforms
      (id, name, slug, base_type, connector_key, password_policy, session_policy, recording_policy, rotation_policy, enabled, created_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10,$11)`,
    [id, name, slug, baseType, connectorKey,
      body.password_policy ? JSON.stringify(body.password_policy) : null,
      body.session_policy ? JSON.stringify(body.session_policy) : null,
      body.recording_policy ? JSON.stringify(body.recording_policy) : null,
      body.rotation_policy ? JSON.stringify(body.rotation_policy) : null,
      nowIso(), user.username]
  )
  await pamAudit(event, user, { action: 'platform.create', objectType: 'platform', objectId: id, severity: 'notice', details: { name, baseType } })
  return { id }
})
