import { requireUser } from '~~/server/utils/auth'
import { stackFileAtCommit } from '~~/server/utils/gitlab'
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const name = getRouterParam(event, 'name')!
  const sha = String(getQuery(event).sha || '')
  if (!sha) throw createError({ statusCode: 400, statusMessage: 'sha required' })
  return { compose: await stackFileAtCommit(name, sha) }
})
