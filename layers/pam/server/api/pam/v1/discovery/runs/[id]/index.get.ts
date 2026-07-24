import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePamPermission } from '~~/layers/pam/server/utils/pamStore'

export default defineEventHandler(async (event) => {
  await requirePamPermission(event, 'pam.discovery.view')
  const id = getRouterParam(event, 'id')!
  const db = getPamDb()
  const run = (await db.query('SELECT * FROM pam.discovery_runs WHERE id=$1', [id])).rows[0]
  if (!run) throw createError({ statusCode: 404, statusMessage: 'Run not found' })
  const accounts = (await db.query('SELECT id, username, address, account_type, privilege_level, status, matched_rule_id, is_duplicate FROM pam.discovered_accounts WHERE run_id=$1 ORDER BY username LIMIT 1000', [id])).rows
  return { run, accounts }
})
