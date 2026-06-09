import { requireUser } from '~~/server/utils/auth'
import { useDocker, assertSwarm } from '~~/server/utils/docker'
export default defineEventHandler(async (event) => {
  await requireUser(event)
  await assertSwarm()
  const nodes = await useDocker().listNodes()
  return nodes.map((n) => ({
    id: n.ID,
    hostname: n.Description?.Hostname,
    role: n.Spec?.Role,
    availability: n.Spec?.Availability,
    state: n.Status?.State,
    leader: n.ManagerStatus?.Leader || false,
    reachability: n.ManagerStatus?.Reachability,
    addr: n.Status?.Addr || n.ManagerStatus?.Addr,
    engine: n.Description?.Engine?.EngineVersion,
    platform: `${n.Description?.Platform?.OS}/${n.Description?.Platform?.Architecture}`,
    cpus: (n.Description?.Resources?.NanoCPUs || 0) / 1e9,
    memory: n.Description?.Resources?.MemoryBytes || 0,
    labels: n.Spec?.Labels || {}
  }))
})
