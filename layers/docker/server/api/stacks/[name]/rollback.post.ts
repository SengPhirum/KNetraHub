import { requireRole } from '~~/server/utils/auth'
import { deployStack } from '~~/layers/docker/server/utils/stack'
import { gitlabEnabled, stackFileAtCommit, commitStackFile } from '~~/layers/docker/server/utils/gitlab'
import { audit } from '~~/server/utils/store'
import { fireAlert } from '~~/server/utils/alertNotify'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'operator')
  const name = getRouterParam(event, 'name')!
  const { sha } = await readBody<{ sha: string }>(event)
  if (!(await gitlabEnabled())) throw createError({ statusCode: 400, statusMessage: 'GitLab not configured' })
  const compose = await stackFileAtCommit(name, sha)
  await commitStackFile({ stackName: name, content: compose, message: `Rollback ${name} to ${sha.slice(0,8)}`, authorName: user.displayName, authorEmail: `${user.username}@knetrahub` })
  const result = await deployStack(name, compose).catch(async (err: any) => {
    await fireAlert({ ruleType: 'deploy_failed', target: name, severity: 'critical', vars: { target: name, error: err?.statusMessage || err?.message || 'Unknown error', actor: user.username, time: new Date().toISOString() } })
    throw err
  })
  await audit({ actor: user.username, action: 'stack.rollback', target: name, detail: sha.slice(0,8) })
  return result
})
