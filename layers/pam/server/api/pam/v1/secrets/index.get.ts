import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePamPermission } from '~~/layers/pam/server/utils/pamStore'

/** List secrets (metadata only; value never included). Requires pam.secret.use. */
export default defineEventHandler(async (event) => {
  await requirePamPermission(event, 'pam.secret.use')
  const { rows } = await getPamDb().query(
    `SELECT s.id, s.name, s.path, s.secret_type, s.environment, s.description, s.current_version,
            s.rotation_interval_days, s.expires_at, s.revoked, s.created_at, s.updated_at,
            sf.name AS safe_name,
            (SELECT count(*)::int FROM pam.secret_policies sp WHERE sp.secret_id = s.id) AS policy_count
       FROM pam.secrets s LEFT JOIN pam.safes sf ON sf.id = s.safe_id
      WHERE s.deleted_at IS NULL ORDER BY s.path ASC`
  )
  return rows
})
