import { requireUser } from '~~/server/utils/auth'
import { getRegistry } from '~~/server/utils/store'
import { registryBaseFromUrl, decodeRegistryAuth, fetchImageHistory } from '~~/server/utils/registryClient'

// Full image config + layer history for a repo:tag (powers the History view).
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const q = getQuery(event)
  const repo = String(q.repo || '')
  const tag = String(q.tag || '')
  if (!repo || !tag) throw createError({ statusCode: 400, statusMessage: 'repo and tag query params required' })

  const reg = await getRegistry(id)
  if (!reg) throw createError({ statusCode: 404, statusMessage: 'Registry not found' })

  const base = registryBaseFromUrl(reg.url)
  const auth = decodeRegistryAuth(reg.auth)
  const hist = await fetchImageHistory(base, encodeURI(repo), tag, auth)
  if (!hist) throw createError({ statusCode: 502, statusMessage: 'Could not read image history' })

  return { repository: repo, tag, ...hist }
})
