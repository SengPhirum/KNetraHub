import { requireUser } from '~~/server/utils/auth'
import { getRegistry } from '~~/server/utils/store'
import { registryBaseFromUrl, decodeRegistryAuth, fetchManifestDetails } from '~~/server/utils/registryClient'

// Manifest details for a repo:tag (digest, size, layers, created, arch/os, or
// the platform list for a multi-arch manifest). Powers the browser's detail view.
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
  const details = await fetchManifestDetails(base, encodeURI(repo), tag, auth)
  if (!details) throw createError({ statusCode: 502, statusMessage: 'Could not read image manifest' })

  return { repository: repo, tag, ...details }
})
