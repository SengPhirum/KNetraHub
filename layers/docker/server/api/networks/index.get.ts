import { requireUser } from '~~/server/utils/auth'
import { useDocker, assertSwarm } from '~~/layers/docker/server/utils/docker'
import { STACK_LABEL } from '~~/layers/docker/server/utils/stack'
export default defineEventHandler(async (event) => {
  await requireUser(event); await assertSwarm()
  return computeNetworksList()
})

export async function computeNetworksList() {
  const nets = await useDocker().listNetworks()
  return nets.map((n) => ({
    id: n.Id, name: n.Name, driver: n.Driver, scope: n.Scope,
    internal: n.Internal, attachable: n.Attachable,
    stack: n.Labels?.[STACK_LABEL] || null,
    subnet: n.IPAM?.Config?.[0]?.Subnet || null,
    created: n.Created
  }))
}
