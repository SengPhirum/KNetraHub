import ping from 'ping'
import net from 'node:net'
import tls from 'node:tls'
import dns from 'node:dns/promises'
import { getMonitoringDb as getDb } from '~~/server/utils/moduleDb'
import { recordEvent } from '../core/events'
import type { ServiceType } from '../../shared/constants'

/**
 * Active service checks (ICMP/TCP/HTTP/DNS/certificate/SMTP/SSH/NTP).
 * All checks are native — no shell interpolation anywhere; parameters are
 * validated per type. Results persist to monitoring.service_results and
 * drive the service status lifecycle + events.
 */

interface CheckResult {
  status: 'ok' | 'warning' | 'critical'
  responseMs: number
  message: string
  perf?: Record<string, number>
}

const CHECKS: Record<ServiceType, (params: Record<string, any>, timeoutMs: number) => Promise<CheckResult>> = {
  async icmp(params, timeoutMs) {
    const started = Date.now()
    const res = await ping.promise.probe(String(params.host), { timeout: Math.ceil(timeoutMs / 1000), min_reply: 1 })
    const rtt = res.time === 'unknown' ? null : Number(res.time)
    if (!res.alive) return { status: 'critical', responseMs: Date.now() - started, message: 'no ICMP reply' }
    return { status: 'ok', responseMs: rtt ?? Date.now() - started, message: `rtt ${rtt}ms`, perf: { rtt_ms: rtt ?? 0 } }
  },

  async tcp(params, timeoutMs) {
    const started = Date.now()
    return new Promise<CheckResult>((resolve) => {
      const socket = net.connect({ host: String(params.host), port: Number(params.port) })
      const done = (result: CheckResult) => {
        socket.destroy()
        resolve(result)
      }
      socket.setTimeout(timeoutMs, () => done({ status: 'critical', responseMs: Date.now() - started, message: 'connect timeout' }))
      socket.on('connect', () => done({ status: 'ok', responseMs: Date.now() - started, message: `port ${params.port} open` }))
      socket.on('error', (err) => done({ status: 'critical', responseMs: Date.now() - started, message: err.message }))
    })
  },

  async http(params, timeoutMs) {
    const started = Date.now()
    const url = new URL(String(params.url))
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('http check requires an http(s) url')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, { redirect: params.follow_redirects === false ? 'manual' : 'follow', signal: controller.signal })
      const bodyText = params.expect_body ? await res.text() : ''
      const ms = Date.now() - started
      const expectStatus = params.expect_status != null ? Number(params.expect_status) : null
      if (expectStatus != null ? res.status !== expectStatus : res.status >= 400) {
        return { status: 'critical', responseMs: ms, message: `HTTP ${res.status}` }
      }
      if (params.expect_body && !bodyText.includes(String(params.expect_body))) {
        return { status: 'critical', responseMs: ms, message: `body did not contain "${params.expect_body}"` }
      }
      return { status: 'ok', responseMs: ms, message: `HTTP ${res.status} in ${ms}ms`, perf: { response_ms: ms, status: res.status } }
    } finally {
      clearTimeout(timer)
    }
  },

  async dns(params, timeoutMs) {
    const started = Date.now()
    const resolver = new dns.Resolver({ timeout: timeoutMs })
    if (params.server) resolver.setServers([String(params.server)])
    const type = String(params.record_type ?? 'A').toUpperCase()
    const answers = await resolver.resolve(String(params.name), type as never)
    const ms = Date.now() - started
    const list = (Array.isArray(answers) ? answers : [answers]).map((a) => typeof a === 'object' ? JSON.stringify(a) : String(a))
    if (params.expect && !list.some((a) => a.includes(String(params.expect)))) {
      return { status: 'critical', responseMs: ms, message: `no ${type} answer matched "${params.expect}" (got ${list.join(', ')})` }
    }
    return { status: 'ok', responseMs: ms, message: `${type} ${list.slice(0, 4).join(', ')}`, perf: { response_ms: ms, answers: list.length } }
  },

  async certificate(params, timeoutMs) {
    const started = Date.now()
    return new Promise<CheckResult>((resolve, reject) => {
      const socket = tls.connect({
        host: String(params.host), port: Number(params.port ?? 443),
        servername: String(params.servername ?? params.host), rejectUnauthorized: false
      }, () => {
        const cert = socket.getPeerCertificate()
        socket.end()
        const ms = Date.now() - started
        if (!cert?.valid_to) return resolve({ status: 'critical', responseMs: ms, message: 'no certificate presented' })
        const daysLeft = Math.floor((new Date(cert.valid_to).getTime() - Date.now()) / 86400000)
        const warnDays = Number(params.warn_days ?? 21)
        const critDays = Number(params.crit_days ?? 7)
        const status = daysLeft <= critDays ? 'critical' : daysLeft <= warnDays ? 'warning' : 'ok'
        resolve({ status, responseMs: ms, message: `expires in ${daysLeft}d (${cert.valid_to})`, perf: { days_left: daysLeft } })
      })
      socket.setTimeout(timeoutMs, () => {
        socket.destroy()
        reject(new Error('tls timeout'))
      })
      socket.on('error', reject)
    })
  },

  async smtp(params, timeoutMs) {
    return bannerCheck(String(params.host), Number(params.port ?? 25), timeoutMs, /^220/, 'SMTP banner')
  },

  async ssh(params, timeoutMs) {
    return bannerCheck(String(params.host), Number(params.port ?? 22), timeoutMs, /^SSH-/, 'SSH banner')
  },

  async ntp(params, timeoutMs) {
    const dgram = await import('node:dgram')
    const started = Date.now()
    return new Promise<CheckResult>((resolve) => {
      const socket = dgram.createSocket('udp4')
      const packet = Buffer.alloc(48)
      packet[0] = 0x1b // LI=0 VN=3 Mode=3 (client)
      const timer = setTimeout(() => {
        socket.close()
        resolve({ status: 'critical', responseMs: Date.now() - started, message: 'NTP timeout' })
      }, timeoutMs)
      socket.on('message', () => {
        clearTimeout(timer)
        socket.close()
        const ms = Date.now() - started
        resolve({ status: 'ok', responseMs: ms, message: `NTP reply in ${ms}ms`, perf: { response_ms: ms } })
      })
      socket.on('error', (err) => {
        clearTimeout(timer)
        socket.close()
        resolve({ status: 'critical', responseMs: Date.now() - started, message: err.message })
      })
      socket.send(packet, 123, String(params.host))
    })
  }
}

function bannerCheck(host: string, port: number, timeoutMs: number, pattern: RegExp, label: string): Promise<CheckResult> {
  const started = Date.now()
  return new Promise((resolve) => {
    const socket = net.connect({ host, port })
    const done = (result: CheckResult) => {
      socket.destroy()
      resolve(result)
    }
    socket.setTimeout(timeoutMs, () => done({ status: 'critical', responseMs: Date.now() - started, message: 'timeout' }))
    socket.on('data', (data) => {
      const banner = data.toString().split('\r\n')[0] ?? ''
      done(pattern.test(banner)
        ? { status: 'ok', responseMs: Date.now() - started, message: banner.slice(0, 120) }
        : { status: 'warning', responseMs: Date.now() - started, message: `unexpected ${label}: ${banner.slice(0, 120)}` })
    })
    socket.on('error', (err) => done({ status: 'critical', responseMs: Date.now() - started, message: err.message }))
  })
}

/** Run every service check that is due (called by the queue's services job). */
export async function runDueServiceChecks(): Promise<void> {
  const db = getDb()
  const due = await db.query(
    `SELECT * FROM monitoring.services WHERE enabled AND next_check_at <= now() ORDER BY next_check_at LIMIT 200`
  )
  for (const service of due.rows) {
    await runServiceCheck(service).catch((err) =>
      console.error(`[monitoring:services] check ${service.id} (${service.name}) crashed`, err))
  }
}

export async function runServiceCheck(service: any): Promise<CheckResult> {
  const db = getDb()
  const check = CHECKS[service.type as ServiceType]
  let result: CheckResult
  try {
    if (!check) throw new Error(`unknown service type ${service.type}`)
    result = await check(service.params ?? {}, Number(service.timeout_ms ?? 10000))
    // Response-time thresholds upgrade ok → warning/critical
    if (result.status === 'ok') {
      if (service.crit_response_ms != null && result.responseMs > Number(service.crit_response_ms)) {
        result = { ...result, status: 'critical', message: `${result.message} (over crit threshold ${service.crit_response_ms}ms)` }
      } else if (service.warn_response_ms != null && result.responseMs > Number(service.warn_response_ms)) {
        result = { ...result, status: 'warning', message: `${result.message} (over warn threshold ${service.warn_response_ms}ms)` }
      }
    }
  } catch (err: any) {
    result = { status: 'critical', responseMs: 0, message: String(err?.message ?? err) }
  }

  const failures = result.status === 'ok' ? 0 : Number(service.consecutive_failures) + 1
  const interval = result.status === 'ok' ? Number(service.interval_seconds) : Number(service.retry_interval_seconds)

  await db.query(
    `UPDATE monitoring.services SET status = $2, status_message = $3, last_check_at = now(),
       last_response_ms = $4, next_check_at = now() + make_interval(secs => $5),
       consecutive_failures = $6, updated_at = now()
     WHERE id = $1`,
    [service.id, result.status, result.message.slice(0, 500), result.responseMs, interval, failures]
  )
  await db.query(
    `INSERT INTO monitoring.service_results (time, service_id, device_id, status, response_ms, message, perf)
     VALUES (now(),$1,$2,$3,$4,$5,$6)`,
    [service.id, service.device_id, result.status, result.responseMs, result.message.slice(0, 500),
      result.perf ? JSON.stringify(result.perf) : null]
  )

  if (result.status !== service.status) {
    await recordEvent(db, {
      deviceId: service.device_id, entityType: 'service', entityId: Number(service.id),
      eventType: result.status === 'ok' ? 'service_up' : 'service_down',
      severity: result.status === 'critical' ? 'error' : result.status === 'warning' ? 'warning' : 'info',
      message: `Service ${service.name} (${service.type}): ${service.status} → ${result.status} — ${result.message}`
    })
  }
  return result
}
