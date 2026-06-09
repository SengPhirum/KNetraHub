import { requireUser } from '~~/server/utils/auth'
import { gitlabEnabled } from '~~/server/utils/gitlab'
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const c = useRuntimeConfig().gitlab
  return { enabled: gitlabEnabled(), url: c.url, projectId: c.projectId, branch: c.branch, stacksPath: c.stacksPath }
})
