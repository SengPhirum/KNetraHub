import { requireRole } from '~~/server/utils/auth'
import { deployStack } from '~~/layers/docker/server/utils/stack'
import { gitlabEnabled, commitStackFile } from '~~/layers/docker/server/utils/gitlab'
import { recordStackVersion } from '~~/layers/docker/server/utils/stackHistory'
import { audit } from '~~/server/utils/store'
import { fireAlert } from '~~/server/utils/alertNotify'

/** Where this deploy's compose gets versioned. New deploys automatically
 * prefer GitLab when configured and otherwise use the local DB. `both`
 * remains accepted for older callers that explicitly request both trails. */
export type StackTrackOption = 'local' | 'gitlab' | 'both'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'operator')
  const body = await readBody<{
    name: string
    compose: string
    message?: string
    commit?: boolean
    track?: StackTrackOption
    secretsContent?: Record<string, string>
    configsContent?: Record<string, string>
  }>(event)
  if (!body.name || !body.compose) {
    throw createError({ statusCode: 400, statusMessage: 'name and compose are required' })
  }
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(body.name)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid stack name' })
  }

  const glOn = await gitlabEnabled()
  // Default: GitLab when configured, local DB otherwise. The legacy
  // `commit: false` flag still maps to "skip GitLab" for older callers.
  let track: StackTrackOption = body.track && ['local', 'gitlab', 'both'].includes(body.track)
    ? body.track
    : (glOn ? 'gitlab' : 'local')
  if (body.commit === false && !body.track) track = 'local'
  const wantGitlab = glOn && (track === 'both' || track === 'gitlab')
  // A GitLab-only choice without GitLab configured still records locally -
  // silently versioning nowhere would be worse than either option.
  const wantLocal = track === 'both' || track === 'local' || (track === 'gitlab' && !glOn)

  const message = body.message || `Deploy ${body.name} via KNetraHub`

  // Version first (GitLab commit, then the local row carrying its sha) so
  // the desired state is recorded even if the deploy itself fails.
  let commit: any = null
  if (wantGitlab) {
    commit = await commitStackFile({
      stackName: body.name,
      content: body.compose,
      message,
      authorName: user.displayName,
      authorEmail: `${user.username}@knetrahub`
    })
  }
  if (wantLocal) {
    await recordStackVersion({
      stackName: body.name,
      compose: body.compose,
      message,
      author: user.displayName || user.username,
      gitlabSha: commit?.id || null
    }).catch((err: any) => console.error('[stacks] failed to record local history', err))
  }

  const result = await deployStack(body.name, body.compose, {
    secretsContent: body.secretsContent,
    configsContent: body.configsContent
  }).catch(async (err: any) => {
    await fireAlert({ ruleType: 'deploy_failed', target: body.name, severity: 'critical', vars: { target: body.name, error: err?.statusMessage || err?.message || 'Unknown error', actor: user.username, time: new Date().toISOString() } })
    throw err
  })
  await audit({ actor: user.username, action: 'stack.deploy', target: body.name, detail: `${result.created.length} created, ${result.updated.length} updated` })
  await fireAlert({
    ruleType: 'stack_deployed',
    target: body.name,
    severity: 'info',
    vars: {
      target: body.name,
      action: result.created.length && !result.updated.length ? 'deployed' : 'updated',
      actor: user.username,
      created: String(result.created.length),
      updated: String(result.updated.length),
      time: new Date().toISOString()
    }
  })
  return { ...result, commit }
})
