import { requireRole } from '~~/server/utils/auth'
import { withServiceSpec } from '~~/server/utils/serviceMutation'
import { audit } from '~~/server/utils/store'

interface ConfigInput {
  configId: string
  configName: string
  fileName?: string
  uid?: string
  gid?: string
  mode?: number
}

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'operator')
  const id = getRouterParam(event, 'id')!
  const { configs } = await readBody<{ configs: ConfigInput[] }>(event)
  const { info } = await withServiceSpec(id, (spec) => {
    spec.TaskTemplate.ContainerSpec.Configs = (configs || [])
      .filter((c) => c.configId)
      .map((c) => ({
        ConfigID: c.configId,
        ConfigName: c.configName,
        File: {
          Name: c.fileName || c.configName,
          UID: c.uid || '0',
          GID: c.gid || '0',
          Mode: c.mode ?? 0o444
        }
      }))
  })
  await audit({ actor: user.username, action: 'service.update-configs', target: info.Spec.Name })
  return { ok: true }
})
