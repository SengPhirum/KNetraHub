import { requireRole } from '~~/server/utils/auth'
import { deployStack } from '~~/server/utils/stack'
import { gitlabEnabled, commitStackFile } from '~~/server/utils/gitlab'
import { audit } from '~~/server/utils/store'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'operator')
  const body = await readBody<{ name: string; compose: string; message?: string; commit?: boolean }>(event)
  if (!body.name || !body.compose) {
    throw createError({ statusCode: 400, statusMessage: 'name and compose are required' })
  }
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(body.name)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid stack name' })
  }

  // Commit to GitLab first so the desired state is recorded even if deploy fails.
  let commit: any = null
  if (body.commit !== false && gitlabEnabled()) {
    commit = await commitStackFile({
      stackName: body.name,
      content: body.compose,
      message: body.message || `Deploy ${body.name} via DockHub`,
      authorName: user.displayName,
      authorEmail: `${user.username}@dockhub`
    })
  }

  const result = await deployStack(body.name, body.compose)
  await audit({ actor: user.username, action: 'stack.deploy', target: body.name, detail: `${result.created.length} created, ${result.updated.length} updated` })
  return { ...result, commit }
})
