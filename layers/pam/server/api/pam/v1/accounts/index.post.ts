import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePamPermission, assertSafePermission, pamAudit, loadOr404, newId, nowIso } from '~~/layers/pam/server/utils/pamStore'
import { storeCredentialVersion } from '~~/layers/pam/server/utils/pamVault'

const ACCOUNT_TYPES = [
  'windows-domain', 'windows-local', 'linux', 'ssh-key', 'network-device', 'database',
  'web-app', 'cloud-key', 'cloud-role', 'service', 'application', 'kubernetes-sa',
  'api-credential', 'certificate', 'generic'
]
const CRITICALITY = ['low', 'medium', 'high', 'critical']

/**
 * Onboard a privileged account into a safe (operator tier + add_account on the
 * safe). An optional initial credential is sealed immediately via the vault and
 * NEVER echoed back. The response contains only the new account id.
 */
export default defineEventHandler(async (event) => {
  const { user, tier } = await requirePamPermission(event, 'pam.account.manage')
  const body = await readBody(event)
  const safeId = String(body?.safe_id || '').trim()
  if (!safeId) throw createError({ statusCode: 400, statusMessage: 'safe_id is required' })
  await loadOr404('pam.safes', safeId, 'Safe not found')
  await assertSafePermission(user, tier, safeId, 'add_account')

  const name = String(body?.name || '').trim()
  const username = String(body?.username || '').trim()
  if (!name || !username) throw createError({ statusCode: 400, statusMessage: 'name and username are required' })

  const db = getPamDb()
  const id = newId()
  await db.query(
    `INSERT INTO pam.accounts
      (id, name, username, address, port, safe_id, platform_id, environment, owner, account_type,
       privilege_level, criticality, auto_managed, enabled, discovery_source, custom_properties,
       ipam_address_id, monitoring_device_id, notes, created_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true,$14,$15,$16,$17,$18,$19,$20)`,
    [id, name, username, body.address || null, body.port ? Number(body.port) : null, safeId,
      body.platform_id || null, body.environment || null, body.owner || null,
      ACCOUNT_TYPES.includes(body.account_type) ? body.account_type : 'generic',
      body.privilege_level || null, CRITICALITY.includes(body.criticality) ? body.criticality : 'medium',
      body.auto_managed === true, body.discovery_source || null,
      body.custom_properties ? JSON.stringify(body.custom_properties) : null,
      body.ipam_address_id || null, body.monitoring_device_id || null, body.notes || null,
      nowIso(), user.username]
  )

  if (body.credential) {
    await storeCredentialVersion({ accountId: id, plaintext: String(body.credential), valueType: body.value_type || 'password', source: 'onboard', createdBy: user.username })
    await db.query("UPDATE pam.accounts SET rotation_status='managed' WHERE id=$1", [id])
  }
  await pamAudit(event, user, { action: 'account.create', objectType: 'account', objectId: id, safeId, severity: 'notice', details: { name, username, hadCredential: !!body.credential } })
  return { id }
})
