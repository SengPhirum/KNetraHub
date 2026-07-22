/**
 * Where a feed notification should take you when clicked.
 *
 * Alert targets are human names (a service name, a subnet CIDR), not ids, so
 * these deliberately resolve to the relevant list/console page rather than
 * guessing a detail route that may 404. The one exception is a stack, whose
 * route is keyed by the same name the alert carries.
 *
 * Returns null when there is no sensible destination — callers then render the
 * row as plain text instead of a link.
 */
export function notificationLink(item: { app: string; ruleType?: string; target?: string }): string | null {
  const rule = item.ruleType || ''

  if (item.app === 'portal') {
    if (rule === 'user_role_changed' || rule === 'user_deleted') return '/users'
    if (rule === 'module_load_failed') return '/admin/modules'
    if (rule === 'backup_failed') return '/admin/maintenance'
    // login_failed / admin_login and anything else: the audit trail has the detail.
    return '/audit'
  }

  if (item.app === 'docker') {
    if (rule === 'node_down' || rule === 'disk_usage_threshold') return '/nodes'
    if (rule === 'task_failed' || rule === 'task_shutdown') return '/tasks'
    // A deployed/updated stack still exists, so link straight at it; a removed
    // one no longer has a page.
    if (rule === 'stack_deployed' && item.target) return `/stacks/${encodeURIComponent(item.target)}`
    if (rule === 'stack_removed' || rule === 'deploy_failed') return '/stacks'
    return '/services'
  }

  // Monitoring keeps its own incident list — that's the useful landing page for
  // every rule it raises.
  if (item.app === 'monitoring') return '/monitoring/alerts'

  if (item.app === 'ipmgt') {
    if (rule === 'ip_request_submitted') return '/ipmgt/requests'
    return '/ipmgt/subnets'
  }

  return null
}
