import { getPamDb } from '~~/server/utils/moduleDb'
import { requireRunner, runnerConfig } from '~~/layers/pam/server/utils/pamRunner'

/** The runner's current operating parameters + the connectors it may load. */
export default defineEventHandler(async (event) => {
  const runner = await requireRunner(event)
  return runnerConfig(runner, getPamDb())
})
