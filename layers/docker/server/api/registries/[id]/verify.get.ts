import { requireUser } from '~~/server/utils/auth'
import { getRegistry } from '~~/server/utils/store'
import { registryBaseFromUrl, decodeRegistryAuth, verifyRegistry } from '~~/layers/docker/server/utils/registryClient'

// Probe a saved registry's /v2/ endpoint to confirm reachability + credentials.
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const reg = await getRegistry(id)
  if (!reg) throw createError({ statusCode: 404, statusMessage: 'Registry not found' })

  const base = registryBaseFromUrl(reg.url)
  const auth = decodeRegistryAuth(reg.auth)
  const result = await verifyRegistry(base, auth)
  return { id: reg.id, name: reg.name, base, ...result }
})
