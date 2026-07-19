import { requireUser } from '~~/server/utils/auth'
import { listStacks, type StackSummary } from '~~/layers/docker/server/utils/stack'
import { gitlabEnabled, listStackFiles } from '~~/layers/docker/server/utils/gitlab'
import { listTrackedStackNames } from '~~/layers/docker/server/utils/stackHistory'
export default defineEventHandler(async (event) => {
  await requireUser(event)
  return computeStacksList()
})

export async function computeStacksList() {
  const running = await listStacks()
  const map = new Map(running.map((s) => [s.name, { ...s, inGit: false, inLocal: false }]))
  const ensure = (name: string) => {
    const ex = map.get(name)
    if (ex) return ex
    const created: StackSummary & { inGit: boolean; inLocal: boolean } = {
      name, services: 0, networks: 0, volumes: 0, configs: 0, secrets: 0,
      runningTasks: 0, desiredTasks: 0, failedTasks: 0, issueTasks: 0,
      issues: [], status: 'partial', updatedAt: null, inGit: false, inLocal: false
    }
    map.set(name, created)
    return created
  }
  if (await gitlabEnabled()) {
    try {
      for (const f of await listStackFiles()) ensure(f.name).inGit = true
    } catch { /* gitlab unreachable — show running only */ }
  }
  try {
    for (const name of await listTrackedStackNames()) ensure(name).inLocal = true
  } catch { /* db unreachable — show running only */ }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
}
