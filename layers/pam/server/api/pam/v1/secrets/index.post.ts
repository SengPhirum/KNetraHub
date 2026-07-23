import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePamPermission, pamAudit, newId, nowIso } from '~~/layers/pam/server/utils/pamStore'
import { storeSecretVersion } from '~~/layers/pam/server/utils/pamVault'
import { generatePassword } from '~~/layers/pam/server/utils/pamPassword'

const TYPES = ['kv', 'json', 'db_credential', 'api_token', 'certificate', 'ssh_key', 'cloud_credential', 'password']

/** Create a secret and its first version (pam.secret.manage). Value is sealed, never echoed. */
export default defineEventHandler(async (event) => {
  const { user } = await requirePamPermission(event, 'pam.secret.manage')
  const body = await readBody(event)
  const name = String(body?.name || '').trim()
  const path = String(body?.path || '').trim()
  if (!name || !path) throw createError({ statusCode: 400, statusMessage: 'name and path are required' })

  const db = getPamDb()
  const dup = await db.query('SELECT 1 FROM pam.secrets WHERE lower(path)=lower($1) AND deleted_at IS NULL', [path])
  if (dup.rows.length) throw createError({ statusCode: 409, statusMessage: `A secret already exists at "${path}"` })

  const id = newId()
  await db.query(
    `INSERT INTO pam.secrets (id, name, path, safe_id, secret_type, environment, description, tags, rotation_interval_days, expires_at, created_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [id, name, path, body.safe_id || null, TYPES.includes(body.secret_type) ? body.secret_type : 'kv',
      body.environment || null, body.description || null, body.tags ? JSON.stringify(body.tags) : null,
      body.rotation_interval_days ? Number(body.rotation_interval_days) : null, body.expires_at || null, nowIso(), user.username]
  )
  const value = body.value !== undefined && body.value !== null && String(body.value) !== ''
    ? String(body.value)
    : (body.generate ? generatePassword({ length: 32 }) : null)
  if (value) await storeSecretVersion(id, value, user.username, db)

  await pamAudit(event, user, { action: 'secret.create', objectType: 'secret', objectId: id, severity: 'notice', details: { path, hasValue: !!value } })
  return { id }
})
