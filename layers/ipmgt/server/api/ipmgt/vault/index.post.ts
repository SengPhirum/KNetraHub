import { nanoid } from 'nanoid'
import { getDb } from '~~/server/utils/db'
import { requireIpam, ipamAudit } from '~~/layers/ipmgt/server/utils/ipamStore'
import { encryptSecret } from '~~/server/utils/secretCrypto'

const ITEM_TYPES = ['password', 'api_credential', 'certificate', 'note']

export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'manager')
  const body = await readBody(event)
  const name = String(body?.name || '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  const value = String(body?.value || '')
  if (!value) throw createError({ statusCode: 400, statusMessage: 'A value is required' })

  const id = nanoid()
  const now = new Date().toISOString()
  await getDb().query(
    `INSERT INTO ipmgt_vault_items (
      id, name, item_type, value_enc, username, url, expiry_date, owner,
      related_device_id, related_location_id, notes, created_at, created_by
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      id, name, ITEM_TYPES.includes(body.item_type) ? body.item_type : 'password', encryptSecret(value),
      body.username || null, body.url || null, body.expiry_date || null, body.owner || null,
      body.related_device_id || null, body.related_location_id || null, body.notes || null,
      now, user.username
    ]
  )
  await ipamAudit(user, 'ipmgt.vault.create', id, { name, item_type: body.item_type })
  return { id }
})
