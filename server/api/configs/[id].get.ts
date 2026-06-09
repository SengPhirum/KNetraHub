import { requireUser } from '~~/server/utils/auth'
import { useDocker } from '~~/server/utils/docker'
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const c: any = await useDocker().getConfig(id).inspect()
  return { id: c.ID, name: c.Spec?.Name, data: c.Spec?.Data ? Buffer.from(c.Spec.Data, 'base64').toString('utf8') : '' }
})
