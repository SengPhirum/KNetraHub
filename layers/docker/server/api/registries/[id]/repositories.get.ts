import { requireUser } from '~~/server/utils/auth'
import { getRegistry } from '~~/server/utils/store'
import { registryBaseFromUrl, decodeRegistryAuth, registryV2Get } from '~~/layers/docker/server/utils/registryClient'

// List repositories in a registry via the v2 _catalog API, following the Link
// header for pagination (capped so a misbehaving registry can't loop forever).
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const reg = await getRegistry(id)
  if (!reg) throw createError({ statusCode: 404, statusMessage: 'Registry not found' })

  const base = registryBaseFromUrl(reg.url)
  const auth = decodeRegistryAuth(reg.auth)

  const repositories: string[] = []
  let path = '_catalog?n=1000'
  let lastStatus = 0
  let lastError: string | undefined

  for (let page = 0; page < 20; page++) {
    const { status, data, headers, error } = await registryV2Get<{ repositories?: string[] }>(base, path, auth)
    lastStatus = status
    lastError = error
    if (status !== 200 || !data) break
    if (Array.isArray(data.repositories)) repositories.push(...data.repositories)
    const next = parseNextLink(headers?.get('link') ?? null)
    if (!next) break
    path = next
  }

  if (!repositories.length && lastStatus !== 200) {
    throw createError({ statusCode: 502, statusMessage: catalogError(lastStatus, lastError) })
  }

  repositories.sort((a, b) => a.localeCompare(b))
  return { registry: { id: reg.id, name: reg.name, base }, repositories }
})

// Extract the path+query of a Link header's rel="next" entry, stripped of the
// leading /v2/ so it can be re-fed to registryV2Get.
function parseNextLink(link: string | null): string | null {
  if (!link) return null
  const m = link.match(/<([^>]+)>\s*;\s*rel="?next"?/i)
  if (!m?.[1]) return null
  try {
    const u = new URL(m[1], 'http://x')
    return (u.pathname + u.search).replace(/^\/v2\//, '').replace(/^\//, '')
  } catch {
    return m[1].replace(/^\/v2\//, '').replace(/^\//, '')
  }
}

function catalogError(status: number, error?: string): string {
  if (status === 401) return 'Authentication failed — check the registry credentials'
  if (status === 404) return 'No Docker Registry v2 catalog at this URL'
  if (status === 0) return `Registry unreachable${error ? `: ${error}` : ''}`
  return `Registry returned HTTP ${status}`
}
