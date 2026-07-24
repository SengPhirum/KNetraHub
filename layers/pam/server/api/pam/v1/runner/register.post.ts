import { getPamDb } from '~~/server/utils/moduleDb'
import { requireRunner, registerRunner, runnerRequestIp } from '~~/layers/pam/server/utils/pamRunner'

/** A runner enrols with its token, reports capabilities/version/os, and receives
 * its operating config (poll interval, allowlist, expected connector digests). */
export default defineEventHandler(async (event) => {
  const runner = await requireRunner(event)
  const body = await readBody(event).catch(() => ({}))
  const config = await registerRunner(runner, {
    version: body?.version ? String(body.version) : undefined,
    os: body?.os ? String(body.os) : undefined,
    capabilities: body?.capabilities ?? undefined,
    ip: runnerRequestIp(event) ?? undefined
  }, getPamDb())
  return { ok: true, config }
})
