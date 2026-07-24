import { getPamDb } from '~~/server/utils/moduleDb'
import { requireRunner, heartbeat, runnerRequestIp } from '~~/layers/pam/server/utils/pamRunner'

/** Liveness + active-job count + optional drain signal from the runner. */
export default defineEventHandler(async (event) => {
  const runner = await requireRunner(event)
  const body = await readBody(event).catch(() => ({}))
  await heartbeat(runner, {
    activeJobs: Number(body?.activeJobs ?? 0),
    status: body?.status === 'draining' ? 'draining' : 'online',
    ip: runnerRequestIp(event) ?? undefined
  }, getPamDb())
  return { ok: true, ts: new Date().toISOString() }
})
