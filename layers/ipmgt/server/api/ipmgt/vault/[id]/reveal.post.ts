import { nanoid } from 'nanoid'
import { getIpamDb as getDb } from '~~/server/utils/moduleDb'
import { requireIpam, ipamAudit } from '~~/layers/ipmgt/server/utils/ipamStore'
import { requirePasswordConfirm } from '~~/server/utils/confirmAction'
import { decryptSecret } from '~~/server/utils/secretCrypto'

// Reveal a vault item's secret value. Requires admin tier AND a fresh
// password confirmation (re-authorization, not just the caller's existing
// session) - the one place in the whole vault feature that ever returns
// plaintext. Every reveal is logged, both to the curated portal audit trail
// and to a dedicated per-item access log for the item's own history view.
export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'admin')
  await requirePasswordConfirm(event)
  const id = getRouterParam(event, 'id')!
  const db = getDb()
  const cur = await db.query('SELECT * FROM ipmgt_vault_items WHERE id = $1', [id])
  if (!cur.rows.length) throw createError({ statusCode: 404, statusMessage: 'Vault item not found' })

  const value = decryptSecret(cur.rows[0].value_enc)
  await db.query(
    'INSERT INTO ipmgt_vault_access_log (id, vault_item_id, actor, action, accessed_at) VALUES ($1,$2,$3,$4,$5)',
    [nanoid(), id, user.username, 'reveal', new Date().toISOString()]
  )
  await ipamAudit(user, 'ipmgt.vault.reveal', id, { name: cur.rows[0].name })
  return { value }
})
