import { requireRole } from '~~/server/utils/auth'
import { deployStack } from '~~/layers/docker/server/utils/stack'
import { gitlabEnabled, commitStackFile } from '~~/layers/docker/server/utils/gitlab'
import { audit } from '~~/server/utils/store'
import { fireAlert } from '~~/server/utils/alertNotify'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'operator')
  const body = await readBody<{
    name: string
    compose: string
    message?: string
    commit?: boolean
    secretsContent?: Record<string, string>
    configsContent?: Record<string, string>
  }>(event)
  if (!body.name || !body.compose) {
    throw createError({ statusCode: 400, statusMessage: 'name and compose are required' })
  }
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(body.name)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid stack name' })
  }

  // Commit to GitLab first so the desired state is recorded even if deploy fails.
  let commit: any = null
  if (body.commit !== false && (await gitlabEnabled())) {
    commit = await commitStackFile({
      stackName: body.name,
      content: body.compose,
      message: body.message || `Deploy ${body.name} via KNetraHub`,
      authorName: user.displayName,
      authorEmail: `${user.username}@knetrahub`
    })
  }

  const result = await deployStack(body.name, body.compose, {
    secretsContent: body.secretsContent,
    configsContent: body.configsContent
  }).catch(async (err: any) => {
    await fireAlert({ ruleType: 'deploy_failed', target: body.name, severity: 'critical', vars: { target: body.name, error: err?.statusMessage || err?.message || 'Unknown error', actor: user.username, time: new Date().toISOString() } })
    throw err
  })
  await audit({ actor: user.username, action: 'stack.deploy', target: body.name, detail: `${result.created.length} created, ${result.updated.length} updated` })
  return { ...result, commit }
})
