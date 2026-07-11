import { requireUser } from '~~/server/utils/auth'
import { combinedStackHistory } from '~~/layers/docker/server/utils/stackHistory'
import { gitlabEnabled } from '~~/layers/docker/server/utils/gitlab'

// Merged version trail for one stack: local DB rows + any GitLab commits not
// yet mirrored locally. Powers the stack list's history modal and the stack
// detail History tab.
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const name = getRouterParam(event, 'name')!
  const [history, gitlab] = await Promise.all([combinedStackHistory(name), gitlabEnabled()])
  return { name, gitlabEnabled: gitlab, history }
})
