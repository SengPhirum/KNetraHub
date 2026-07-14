import { getDb } from '~~/server/utils/db'
import { requireIpam, ipamAudit } from '~~/layers/ipmgt/server/utils/ipamStore'
import { encryptSecret } from '~~/server/utils/secretCrypto'

const ITEM_TYPES = ['password', 'api_credential', 'certificate', 'note']

// Blank `value` keeps the current stored ciphertext (list responses never
// return it, so the edit form submits it empty unless replaced).
export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'manager')
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const db = getDb()
  const cur = await db.query('SELECT * FROM ipmgt_vault_items WHERE id = $1', [id])
  if (!cur.rows.length) throw createError({ statusCode: 404, statusMessage: 'Vault item not found' })
  const row = cur.rows[0]
  const name = body.name !== undefined ? String(body.name).trim() : row.name
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Name is required' })

  await db.query(
    `UPDATE ipmgt_vault_items SET
       name=$2, item_type=$3, value_enc=COALESCE($4, value_enc), username=$5, url=$6, expiry_date=$7, owner=$8,
       related_device_id=$9, related_location_id=$10, notes=$11, updated_at=$12, updated_by=$13
     WHERE id=$1`,
    [
      id, name,
      body.item_type === undefined ? row.item_type : (ITEM_TYPES.includes(body.item_type) ? body.item_type : row.item_type),
      body.value ? encryptSecret(String(body.value)) : null,
      body.username === undefined ? row.username : body.username,
      body.url === undefined ? row.url : body.url,
      body.expiry_date === undefined ? row.expiry_date : body.expiry_date,
      body.owner === undefined ? row.owner : body.owner,
      body.related_device_id === undefined ? row.related_device_id : (body.related_device_id || null),
      body.related_location_id === undefined ? row.related_location_id : (body.related_location_id || null),
      body.notes === undefined ? row.notes : body.notes,
      new Date().toISOString(), user.username
    ]
  )
  await ipamAudit(user, 'ipmgt.vault.update', id, { name })
  return { id }
})
