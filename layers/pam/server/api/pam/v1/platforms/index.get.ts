import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePamPermission } from '~~/layers/pam/server/utils/pamStore'
import { connectorForPlatform } from '~~/layers/pam/server/connectors/registry'

/** List platforms with their resolved connector capability summary. */
export default defineEventHandler(async (event) => {
  await requirePamPermission(event, 'pam.platform.view')
  const { rows } = await getPamDb().query(
    `SELECT p.*, (SELECT count(*)::int FROM pam.accounts a WHERE a.platform_id = p.id AND a.deleted_at IS NULL) AS account_count
       FROM pam.platforms p ORDER BY p.name ASC`
  )
  return rows.map((p) => {
    const connector = connectorForPlatform(p)
    return { ...p, connector: connector ? { key: connector.key, runsInProcess: connector.runsInProcess, capabilities: connector.capabilities } : null }
  })
})
