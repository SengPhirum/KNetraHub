import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePamPermission } from '~~/layers/pam/server/utils/pamStore'

/** List applications with identity + policy counts (token hashes never returned). */
export default defineEventHandler(async (event) => {
  await requirePamPermission(event, 'pam.secret.use')
  const { rows } = await getPamDb().query(
    `SELECT a.*,
        (SELECT count(*)::int FROM pam.application_identities i WHERE i.application_id=a.id) AS identity_count,
        (SELECT count(*)::int FROM pam.secret_policies p WHERE p.application_id=a.id) AS policy_count
       FROM pam.applications a ORDER BY a.name ASC`
  )
  return rows
})
