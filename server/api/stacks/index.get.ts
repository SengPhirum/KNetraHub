import { requireUser } from '~~/server/utils/auth'
import { listStacks } from '~~/server/utils/stack'
import { gitlabEnabled, listStackFiles } from '~~/server/utils/gitlab'
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const running = await listStacks()
  const map = new Map(running.map((s) => [s.name, { ...s, inGit: false }]))
  if (gitlabEnabled()) {
    try {
      const files = await listStackFiles()
      for (const f of files) {
        const ex = map.get(f.name)
        if (ex) ex.inGit = true
        else map.set(f.name, { name: f.name, services: 0, networks: 0, configs: 0, secrets: 0, runningTasks: 0, desiredTasks: 0, inGit: true })
      }
    } catch { /* gitlab unreachable — show running only */ }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
})
