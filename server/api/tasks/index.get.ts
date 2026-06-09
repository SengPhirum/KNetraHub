import { requireUser } from '~~/server/utils/auth'
import { useDocker, assertSwarm } from '~~/server/utils/docker'
export default defineEventHandler(async (event) => {
  await requireUser(event); await assertSwarm()
  const docker = useDocker()
  const [tasks, services, nodes] = await Promise.all([docker.listTasks(), docker.listServices(), docker.listNodes()])
  const svc = new Map(services.map((s) => [s.ID, s.Spec?.Name]))
  const node = new Map(nodes.map((n) => [n.ID, n.Description?.Hostname]))
  return tasks.map((t) => ({
    id: t.ID,
    service: svc.get(t.ServiceID!) || t.ServiceID,
    node: node.get(t.NodeID!) || t.NodeID,
    slot: t.Slot,
    image: (t.Spec?.ContainerSpec?.Image || '').split('@')[0],
    desiredState: t.DesiredState,
    state: t.Status?.State,
    message: t.Status?.Err || t.Status?.Message,
    timestamp: t.Status?.Timestamp
  })).sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
})
