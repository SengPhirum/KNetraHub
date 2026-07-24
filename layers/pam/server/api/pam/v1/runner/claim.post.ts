import { getPamDb } from '~~/server/utils/moduleDb'
import { requireRunner, claimForRunner } from '~~/layers/pam/server/utils/pamRunner'

/** Lease one delegated job for this runner. 204 when the queue has nothing for
 * it. The response carries the target context (secrets over this authenticated
 * channel only) and the connector key/version/digest/signature the runner must
 * verify against its local bundle before executing. */
export default defineEventHandler(async (event) => {
  const runner = await requireRunner(event)
  const job = await claimForRunner(runner, getPamDb())
  if (!job) { setResponseStatus(event, 204); return null }
  return job
})
