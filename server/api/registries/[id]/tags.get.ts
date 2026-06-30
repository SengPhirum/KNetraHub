import { requireUser } from '~~/server/utils/auth'
import { getRegistry } from '~~/server/utils/store'
import { registryBaseFromUrl, decodeRegistryAuth, registryV2Get } from '~~/server/utils/registryClient'

// List the tags of a repository (?repo=namespace/name).
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const repo = String(getQuery(event).repo || '')
  if (!repo) throw createError({ statusCode: 400, statusMessage: 'repo query param required' })

  const reg = await getRegistry(id)
  if (!reg) throw createError({ statusCode: 404, statusMessage: 'Registry not found' })

  const base = registryBaseFromUrl(reg.url)
  const auth = decodeRegistryAuth(reg.auth)
  const { status, data, error } = await registryV2Get<{ name?: string; tags?: string[] }>(
    base,
    `${encodeURI(repo)}/tags/list?n=1000`,
    auth
  )
  if (status !== 200 || !data) {
    throw createError({ statusCode: 502, statusMessage: error || `Failed to list tags (HTTP ${status})` })
  }

  const tags = Array.isArray(data.tags) ? [...data.tags].sort((a, b) => b.localeCompare(a)) : []
  return { repository: repo, tags }
})
