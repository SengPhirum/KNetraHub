import { getPamDb } from '~~/server/utils/moduleDb'
import { requireRunner, reportForRunner } from '~~/layers/pam/server/utils/pamRunner'
import type { ConnectorRunResult } from '~~/layers/pam/server/utils/pamRunnerCore'

/** Idempotently report a job's structured result. A change/rotate is only
 * sealed & activated when the runner confirms the target changed AND verified. */
export default defineEventHandler(async (event) => {
  const runner = await requireRunner(event)
  const body = await readBody(event)
  const jobId = String(body?.jobId || '').trim()
  if (!jobId) throw createError({ statusCode: 400, statusMessage: 'jobId is required' })
  const result = (body?.result ?? {}) as ConnectorRunResult
  if (typeof result !== 'object' || result === null) throw createError({ statusCode: 400, statusMessage: 'result must be an object' })
  const outcome = await reportForRunner(runner, jobId, result, getPamDb())
  return outcome
})
