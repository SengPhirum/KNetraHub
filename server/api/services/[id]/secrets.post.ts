import { requireRole } from '~~/server/utils/auth'
import { withServiceSpec } from '~~/server/utils/serviceMutation'
import { audit } from '~~/server/utils/store'

interface SecretInput {
  secretId: string
  secretName: string
  fileName?: string
  uid?: string
  gid?: string
  mode?: number
}

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'operator')
  const id = getRouterParam(event, 'id')!
  const { secrets } = await readBody<{ secrets: SecretInput[] }>(event)
  const { info } = await withServiceSpec(id, (spec) => {
    spec.TaskTemplate.ContainerSpec.Secrets = (secrets || [])
      .filter((s) => s.secretId)
      .map((s) => ({
        SecretID: s.secretId,
        SecretName: s.secretName,
        File: {
          Name: s.fileName || s.secretName,
          UID: s.uid || '0',
          GID: s.gid || '0',
          Mode: s.mode ?? 0o444
        }
      }))
  })
  await audit({ actor: user.username, action: 'service.update-secrets', target: info.Spec.Name })
  return { ok: true }
})
