import { requireRole } from '~~/server/utils/auth'
import { deployStack } from '~~/server/utils/stack'
import { gitlabEnabled, stackFileAtCommit, commitStackFile } from '~~/server/utils/gitlab'
import { audit } from '~~/server/utils/store'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'operator')
  const name = getRouterParam(event, 'name')!
  const { sha } = await readBody<{ sha: string }>(event)
  if (!gitlabEnabled()) throw createError({ statusCode: 400, statusMessage: 'GitLab not configured' })
  const compose = await stackFileAtCommit(name, sha)
  await commitStackFile({ stackName: name, content: compose, message: `Rollback ${name} to ${sha.slice(0,8)}`, authorName: user.displayName, authorEmail: `${user.username}@dockhub` })
  const result = await deployStack(name, compose)
  await audit({ actor: user.username, action: 'stack.rollback', target: name, detail: sha.slice(0,8) })
  return result
})
