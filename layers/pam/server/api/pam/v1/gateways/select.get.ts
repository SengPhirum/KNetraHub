import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePamPermission } from '~~/layers/pam/server/utils/pamStore'
import { isValidProtocol } from '~~/layers/pam/server/utils/pamSessionCore'

/**
 * Select a healthy, non-draining gateway for a protocol. The launch UI uses this
 * to confirm a usable gateway exists before creating a session; returns the
 * candidate plus recent health so the operator sees gateway status.
 */
export default defineEventHandler(async (event) => {
  await requirePamPermission(event, 'pam.session.connect')
  const q = getQuery(event)
  const protocol = typeof q.protocol === 'string' && isValidProtocol(q.protocol) ? q.protocol : 'ssh'
  const db = getPamDb()
  const { rows } = await db.query(
    `SELECT g.id, g.name, g.kind, g.address, g.enabled, g.drain_mode, g.capacity,
            h.status, h.active_sessions, h.reported_at
       FROM pam.gateways g
       LEFT JOIN LATERAL (
         SELECT status, active_sessions, reported_at FROM pam.gateway_health
          WHERE gateway_id = g.id ORDER BY reported_at DESC LIMIT 1
       ) h ON true
      WHERE g.enabled = true
      ORDER BY (g.kind = $1) DESC, g.drain_mode ASC, COALESCE(h.active_sessions, 0) ASC`,
    [protocol]
  )
  const candidates = rows.filter((r: any) => !r.drain_mode)
  return {
    protocol,
    selected: candidates[0] ?? null,
    gateways: rows,
    available: candidates.length > 0
  }
})
