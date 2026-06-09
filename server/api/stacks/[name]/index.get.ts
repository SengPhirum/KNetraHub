import { requireUser } from '~~/server/utils/auth'
import { stackServices, STACK_LABEL } from '~~/server/utils/stack'
import { useDocker } from '~~/server/utils/docker'
import { gitlabEnabled, getStackFile, stackHistory } from '~~/server/utils/gitlab'
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const name = getRouterParam(event, 'name')!
  const docker = useDocker()
  const services = await stackServices(name)
  const tasks = await docker.listTasks().catch(() => [])
  const running = new Map<string, number>()
  for (const t of tasks) if (t.Status?.State === 'running' && t.ServiceID) running.set(t.ServiceID, (running.get(t.ServiceID)||0)+1)

  let compose: string | null = null
  let history: any[] = []
  if (gitlabEnabled()) {
    compose = await getStackFile(name).catch(() => null)
    history = await stackHistory(name).catch(() => [])
  }

  return {
    name,
    compose,
    history,
    services: services.map((s) => ({
      id: s.ID,
      name: s.Spec?.Name,
      image: (s.Spec?.TaskTemplate?.ContainerSpec?.Image || '').split('@')[0],
      replicas: s.Spec?.Mode?.Replicated?.Replicas ?? (s.Spec?.Mode?.Global ? null : 0),
      running: running.get(s.ID!) || 0
    }))
  }
})
