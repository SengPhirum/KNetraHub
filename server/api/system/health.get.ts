import { getDb } from '~~/server/utils/db'

// Liveness/readiness probe for the orchestrator (Docker HEALTHCHECK, Swarm
// rolling-update gating - see Dockerfile). Unauthenticated by design: it
// runs before any session exists and before the app is considered "up".
// A single fast query, not waitForDb()'s long retry loop - this just
// answers "is the DB reachable right now", on every poll.
export default defineEventHandler(async (event) => {
  try {
    await Promise.race([
      getDb().query('SELECT 1'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('health check timed out')), 3000))
    ])
    return { status: 'ok' }
  } catch (err: any) {
    setResponseStatus(event, 503)
    return { status: 'error', message: err?.message || 'database unreachable' }
  }
})
