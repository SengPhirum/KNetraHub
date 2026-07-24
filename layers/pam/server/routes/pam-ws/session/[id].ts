import { getPamDb } from '~~/server/utils/moduleDb'
import { verifyGatewayToken } from '~~/layers/pam/server/utils/pamGateway'

/**
 * Browser-terminal WebSocket proxy. The browser connects here with its short-
 * lived, audience-scoped gateway token; the app validates it, resolves the
 * session's internal SSH gateway, opens a server-side socket to it, and pipes
 * bytes both ways. The gateway is therefore NEVER exposed publicly, and the
 * target credential never reaches the browser (the gateway injects it).
 *
 * Security: origin allowlist, gateway-token validation (session-scoped), per-
 * message size cap, and teardown of the upstream socket on browser close.
 */
const MAX_MESSAGE = Number(process.env.PAM_WS_MAX_MESSAGE || 1024 * 1024)
const upstreams = new Map<string, WebSocket>()

function allowedOrigin(origin: string | null): boolean {
  const allow = (process.env.PAM_GATEWAY_ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean)
  if (!origin || allow.length === 0) return true
  return allow.includes(origin)
}

function parse(peer: any): { id: string; token: string; origin: string | null } {
  const raw = peer?.request?.url || peer?.url || ''
  const u = new URL(raw, 'http://localhost')
  const id = u.pathname.split('/').filter(Boolean).pop() || ''
  return { id, token: u.searchParams.get('token') || '', origin: peer?.request?.headers?.get?.('origin') || null }
}

export default defineWebSocketHandler({
  async open(peer) {
    const { id, token, origin } = parse(peer)
    if (!allowedOrigin(origin)) { peer.send('PAM: origin not allowed'); peer.close(); return }
    const claims = token ? await verifyGatewayToken(token) : null
    if (!claims || claims.sessionId !== id) { peer.send('PAM: invalid session token'); peer.close(); return }

    // Resolve the session's internal gateway address (or the default).
    const db = getPamDb()
    const row = (await db.query(
      `SELECT g.address FROM pam.sessions s LEFT JOIN pam.gateways g ON g.id = s.gateway_id WHERE s.id=$1`, [id]
    )).rows[0]
    const addr = row?.address || process.env.NUXT_PAM_SSH_GATEWAY_ADDR || 'pam-ssh-gateway:4222'
    const scheme = process.env.PAM_GATEWAY_WS_TLS === 'true' ? 'wss' : 'ws'

    const up = new WebSocket(`${scheme}://${addr}/session?token=${encodeURIComponent(token)}`)
    up.binaryType = 'arraybuffer'
    upstreams.set(peer.id, up)
    up.onmessage = (e: any) => { try { peer.send(typeof e.data === 'string' ? e.data : new Uint8Array(e.data)) } catch { /* peer gone */ } }
    up.onclose = () => { try { peer.close() } catch {} ; upstreams.delete(peer.id) }
    up.onerror = () => { try { peer.send('PAM: gateway connection error'); peer.close() } catch {} }
  },
  message(peer, message) {
    const up = upstreams.get(peer.id)
    if (!up || up.readyState !== 1) return
    const data = message.uint8Array()
    if (data.byteLength > MAX_MESSAGE) { peer.close(); return }
    up.send(data)
  },
  close(peer) {
    const up = upstreams.get(peer.id)
    if (up) { try { up.close() } catch {} ; upstreams.delete(peer.id) }
  },
  error(peer) {
    const up = upstreams.get(peer.id)
    if (up) { try { up.close() } catch {} ; upstreams.delete(peer.id) }
  }
})
