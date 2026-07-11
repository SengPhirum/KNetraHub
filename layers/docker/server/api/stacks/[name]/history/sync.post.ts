import { requireRole } from '~~/server/utils/auth'
import { syncStackHistoryWithGitlab } from '~~/layers/docker/server/utils/stackHistory'
import { audit } from '~~/server/utils/store'

// Two-way reconcile of one stack's local history with GitLab: pull commits
// the local DB doesn't have, push local-only versions newer than GitLab's
// head. Used when GitLab is connected after stacks were already deployed
// with local-only tracking (or vice versa).
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'operator')
  const name = getRouterParam(event, 'name')!
  const result = await syncStackHistoryWithGitlab(name)
  await audit({ actor: user.username, action: 'stack.history.sync', target: name, detail: `${result.pulled} pulled, ${result.pushed} pushed` })
  return result
})
