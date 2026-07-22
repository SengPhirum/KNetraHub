import { requireRole } from '~~/server/utils/auth'
import { deployStack } from '~~/layers/docker/server/utils/stack'
import { gitlabEnabled, commitStackFile } from '~~/layers/docker/server/utils/gitlab'
import { getStackVersionContent, recordStackVersion } from '~~/layers/docker/server/utils/stackHistory'
import { audit } from '~~/server/utils/store'
import { fireAlert } from '~~/layers/docker/server/utils/alertNotify'
import { logSystem } from '~~/server/utils/moduleLogs'
import { throwDockerError, dockerErrorMessage } from '~~/layers/docker/server/utils/docker'

// Roll a stack back to an earlier version. `version` is a local history row
// id or a GitLab commit sha (the legacy `sha` body key still works) - the
// rollback itself is recorded as a NEW version on both trails, same as a
// regular deploy.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'operator')
  const name = getRouterParam(event, 'name')!
  const body = await readBody<{ version?: string; sha?: string }>(event)
  const ref = body.version || body.sha
  if (!ref) throw createError({ statusCode: 400, statusMessage: 'version is required' })

  const version = await getStackVersionContent(name, ref)
  if (!version) throw createError({ statusCode: 404, statusMessage: 'Version not found in local history or GitLab' })
  const compose = version.compose
  const message = `Rollback ${name} to ${ref.slice(0, 8)}`

  let commit: any = null
  if (await gitlabEnabled()) {
    commit = await commitStackFile({ stackName: name, content: compose, message, authorName: user.displayName, authorEmail: `${user.username}@knetrahub` })
  }
  await recordStackVersion({
    stackName: name,
    compose,
    message,
    author: user.displayName || user.username,
    gitlabSha: commit?.id || null
  }).catch((err: any) => console.error('[stacks] failed to record local history', err))

  const result = await deployStack(name, compose).catch(async (err: any) => {
    const reason = err?.statusMessage || dockerErrorMessage(err, 'Unknown error')
    await logSystem('docker', 'error', 'stack.rollback.failed', `${user.username} failed to roll back stack "${name}" to ${ref.slice(0, 8)}: ${reason}`)
    await fireAlert({ ruleType: 'deploy_failed', target: name, severity: 'critical', vars: { target: name, error: reason, actor: user.username, time: new Date().toISOString() } })
    throwDockerError(err, `Failed to roll back stack "${name}"`)
  })
  await audit({ actor: user.username, action: 'stack.rollback', target: name, detail: ref.slice(0, 8) })
  await logSystem('docker', 'info', 'stack.rolledback',
    `${user.username} rolled back stack "${name}" to ${ref.slice(0, 8)} (${result.created.length} created, ${result.updated.length} updated)`)
  await fireAlert({
    ruleType: 'stack_deployed',
    target: name,
    severity: 'info',
    vars: {
      target: name,
      action: `rolled back to ${ref.slice(0, 8)}`,
      actor: user.username,
      created: String(result.created.length),
      updated: String(result.updated.length),
      time: new Date().toISOString()
    }
  })
  return result
})
