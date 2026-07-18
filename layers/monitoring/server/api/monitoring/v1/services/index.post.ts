import { requireMonitoring } from '../../../../utils/monitoringAuth'
import { monDb, auditMonitoring, badRequest } from '../../../../utils/monApi'
import { SERVICE_TYPES } from '../../../../../shared/constants'

const HOST_PATTERN = /^[a-zA-Z0-9._:-]{1,255}$/

/** Validate per-type check parameters (no shell strings anywhere). */
export function normalizeServiceParams(type: string, raw: any): Record<string, unknown> {
  const params = raw && typeof raw === 'object' ? raw : {}
  const out: Record<string, unknown> = {}
  const needHost = () => {
    const host = String(params.host ?? '').trim()
    if (!host || !HOST_PATTERN.test(host)) badRequest(`${type} check requires a valid host`)
    out.host = host
  }
  const optPort = (fallback?: number) => {
    if (params.port != null && params.port !== '') {
      const port = Number(params.port)
      if (!Number.isInteger(port) || port < 1 || port > 65535) badRequest('port must be 1-65535')
      out.port = port
    } else if (fallback) {
      out.port = fallback
    }
  }
  switch (type) {
    case 'icmp':
      needHost()
      break
    case 'tcp':
      needHost()
      if (params.port == null || params.port === '') badRequest('tcp check requires a port')
      optPort()
      break
    case 'http': {
      let url: URL
      try {
        url = new URL(String(params.url ?? ''))
      } catch {
        badRequest('http check requires a valid url')
      }
      if (url!.protocol !== 'http:' && url!.protocol !== 'https:') badRequest('http check requires an http(s) url')
      out.url = url!.toString()
      if (params.expect_status != null && params.expect_status !== '') out.expect_status = Number(params.expect_status)
      if (params.expect_body) out.expect_body = String(params.expect_body).slice(0, 500)
      if (params.follow_redirects === false) out.follow_redirects = false
      break
    }
    case 'dns': {
      const name = String(params.name ?? '').trim()
      if (!name) badRequest('dns check requires a name to resolve')
      out.name = name
      if (params.server) out.server = String(params.server).trim()
      if (params.record_type) out.record_type = String(params.record_type).toUpperCase().slice(0, 10)
      if (params.expect) out.expect = String(params.expect).slice(0, 500)
      break
    }
    case 'certificate':
      needHost()
      optPort(443)
      if (params.servername) out.servername = String(params.servername).trim()
      if (params.warn_days != null && params.warn_days !== '') out.warn_days = Number(params.warn_days)
      if (params.crit_days != null && params.crit_days !== '') out.crit_days = Number(params.crit_days)
      break
    case 'smtp':
      needHost()
      optPort(25)
      break
    case 'ssh':
      needHost()
      optPort(22)
      break
    case 'ntp':
      needHost()
      optPort(123)
      break
    default:
      badRequest(`unknown service type ${type}`)
  }
  return out
}

export function normalizeServiceBody(body: any): Record<string, unknown> {
  const name = String(body?.name ?? '').trim()
  if (!name) badRequest('name is required')
  if (!SERVICE_TYPES.includes(body?.type)) badRequest(`type must be one of ${SERVICE_TYPES.join(', ')}`)
  const params = normalizeServiceParams(body.type, body?.params)
  return {
    name,
    type: body.type,
    params,
    device_id: body?.device_id ? Number(body.device_id) : null,
    interval_seconds: Math.max(30, Number(body?.interval_seconds) || 300),
    retry_interval_seconds: Math.max(10, Number(body?.retry_interval_seconds) || 60),
    timeout_ms: Math.min(60000, Math.max(500, Number(body?.timeout_ms) || 10000)),
    warn_response_ms: body?.warn_response_ms != null && body.warn_response_ms !== '' ? Number(body.warn_response_ms) : null,
    crit_response_ms: body?.crit_response_ms != null && body.crit_response_ms !== '' ? Number(body.crit_response_ms) : null,
    enabled: body?.enabled !== false,
    poller_group: Number(body?.poller_group) || 0
  }
}

/** POST /api/monitoring/v1/services — create a service check (admin). */
export default defineEventHandler(async (event) => {
  const user = await requireMonitoring(event, 'admin')
  const db = await monDb()
  const body = await readBody(event)
  const s = normalizeServiceBody(body)

  const res = await db.query(
    `INSERT INTO monitoring.services
       (name, type, params, device_id, interval_seconds, retry_interval_seconds, timeout_ms,
        warn_response_ms, crit_response_ms, enabled, poller_group, next_check_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now()) RETURNING id`,
    [s.name, s.type, JSON.stringify(s.params), s.device_id, s.interval_seconds, s.retry_interval_seconds,
      s.timeout_ms, s.warn_response_ms, s.crit_response_ms, s.enabled, s.poller_group]
  )
  await auditMonitoring(user.username, 'service.create', String(res.rows[0].id), `name=${s.name} type=${s.type}`)
  setResponseStatus(event, 201)
  return { id: Number(res.rows[0].id) }
})
