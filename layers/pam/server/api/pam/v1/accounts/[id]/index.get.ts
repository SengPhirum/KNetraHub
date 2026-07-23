import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePam, resolveSafePermissions, loadOr404 } from '~~/layers/pam/server/utils/pamStore'
import { tierGrantsPermission } from '~~/shared/utils/entitlements'

/** Account detail + version metadata + the caller's effective capabilities. Never returns a credential. */
export default defineEventHandler(async (event) => {
  const { user, tier } = await requirePam(event, 'viewer')
  const id = getRouterParam(event, 'id')!
  const account = await loadOr404<any>('pam.accounts', id, 'Account not found')
  if (account.deleted_at) throw createError({ statusCode: 404, statusMessage: 'Account not found' })

  const safePerms = await resolveSafePermissions(user, tier, account.safe_id)
  if (!safePerms.has('view_metadata') && !safePerms.has('list_accounts')) {
    throw createError({ statusCode: 403, statusMessage: 'No access to this account' })
  }

  const db = getPamDb()
  const [versions, deps, links, activity] = await Promise.all([
    db.query('SELECT version, value_type, source, active, created_at, created_by, verified_at, verify_result FROM pam.credential_versions WHERE account_id=$1 ORDER BY version DESC LIMIT 20', [id]),
    db.query('SELECT id, dependency_type, target, last_status, last_updated FROM pam.account_dependencies WHERE account_id=$1', [id]),
    db.query('SELECT l.link_type, l.linked_account_id, a.name AS linked_name FROM pam.account_links l JOIN pam.accounts a ON a.id=l.linked_account_id WHERE l.account_id=$1', [id]),
    db.query("SELECT id, ts, actor, action, result, severity FROM pam.audit_events WHERE object_type='account' AND object_id=$1 ORDER BY seq DESC LIMIT 25", [id])
  ])

  const capabilities = {
    canReveal: tierGrantsPermission('pam', tier, 'pam.account.reveal') && safePerms.has('reveal_credential'),
    canUse: tierGrantsPermission('pam', tier, 'pam.account.use') && safePerms.has('use_account'),
    canRotate: tierGrantsPermission('pam', tier, 'pam.account.rotate') && safePerms.has('initiate_rotation'),
    canVerify: tierGrantsPermission('pam', tier, 'pam.account.rotate') && safePerms.has('initiate_verification'),
    canReconcile: tierGrantsPermission('pam', tier, 'pam.account.reconcile') && safePerms.has('initiate_reconciliation'),
    canDelete: tierGrantsPermission('pam', tier, 'pam.account.delete') && safePerms.has('delete_account'),
    canConnect: tierGrantsPermission('pam', tier, 'pam.session.connect') && safePerms.has('use_account')
  }
  return {
    account: { ...account, custom_properties: account.custom_properties ? JSON.parse(account.custom_properties) : {} },
    versions: versions.rows,
    dependencies: deps.rows,
    links: links.rows,
    activity: activity.rows,
    capabilities
  }
})
