import { getDb } from '~~/server/utils/db'
import { requireIpam } from '~~/layers/ipmgt/server/utils/ipamStore'

// Vault metadata only - value_enc is never selected here, not even as
// ciphertext. Gated at manager tier: vault entries are sensitive enough that
// even their existence shouldn't be viewer-visible.
export default defineEventHandler(async (event) => {
  await requireIpam(event, 'manager')
  const { rows } = await getDb().query(`
    SELECT v.id, v.name, v.item_type, v.username, v.url, v.expiry_date, v.owner,
      v.related_device_id, v.related_location_id, v.notes,
      v.created_at, v.updated_at, v.created_by, v.updated_by,
      dev.hostname AS device_hostname, loc.name AS location_name
    FROM ipmgt_vault_items v
    LEFT JOIN ipmgt_devices dev ON dev.id = v.related_device_id
    LEFT JOIN ipmgt_locations loc ON loc.id = v.related_location_id
    ORDER BY v.name ASC
  `)
  return rows
})
