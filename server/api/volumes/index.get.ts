import { requireUser } from '~~/server/utils/auth'
import { useDocker, assertSwarm } from '~~/server/utils/docker'
export default defineEventHandler(async (event) => {
  await requireUser(event); await assertSwarm()
  const res = await useDocker().listVolumes()
  return (res.Volumes || []).map((v) => ({
    name: v.Name, driver: v.Driver, scope: v.Scope,
    mountpoint: v.Mountpoint, created: (v as any).CreatedAt, labels: v.Labels || {}
  }))
})
