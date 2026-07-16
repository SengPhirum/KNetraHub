import type { Pool } from 'pg'
import { decryptSecret } from '~~/server/utils/secretCrypto'
import { renderTemplate, DEFAULT_TITLE_TEMPLATE, DEFAULT_BODY_TEMPLATE, type TemplateContext } from './templates'
import type { TransportType } from '../../shared/constants'

/**
 * Alert transport plugins. Every transport is fetch-based (or raw-socket SMTP)
 * with a strict timeout; configs are AES-256-GCM encrypted at rest and
 * redacted in every stored delivery record. SSRF guard: outbound URLs must be
 * http(s) and may not point at link-local metadata addresses.
 */

interface DeliveryInput {
  transportType: TransportType
  config: Record<string, any>
  title: string
  body: string
  severity: string
  kind: 'alert' | 'recovery' | 'reminder' | 'test'
}

interface DeliveryResult {
  ok: boolean
  target: string // redacted destination
  requestSummary: string
  status?: number
  error?: string
}

const FETCH_TIMEOUT_MS = 10000

function guardUrl(raw: string): URL {
  const url = new URL(raw)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('only http(s) URLs allowed')
  const host = url.hostname
  if (host === '169.254.169.254' || host === 'metadata.google.internal' || host.endsWith('.internal')) {
    throw new Error('blocked destination')
  }
  return url
}

function redactUrl(raw: string): string {
  try {
    const url = new URL(raw)
    // Webhook tokens commonly live in the path — keep origin + first path segment.
    const seg = url.pathname.split('/').filter(Boolean)[0] ?? ''
    return `${url.origin}/${seg}${url.pathname.split('/').length > 2 ? '/…' : ''}`
  } catch {
    return '(invalid url)'
  }
}

async function post(url: string, payload: unknown, headers: Record<string, string> = {}): Promise<DeliveryResult> {
  const target = guardUrl(url)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(target, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(payload),
      signal: controller.signal
    })
    return {
      ok: res.ok,
      target: redactUrl(url),
      requestSummary: `POST ${redactUrl(url)}`,
      status: res.status,
      error: res.ok ? undefined : `HTTP ${res.status}`
    }
  } catch (err: any) {
    return { ok: false, target: redactUrl(url), requestSummary: `POST ${redactUrl(url)}`, error: String(err?.message ?? err) }
  } finally {
    clearTimeout(timer)
  }
}

type TransportFn = (input: DeliveryInput) => Promise<DeliveryResult>

const TRANSPORTS: Record<TransportType, TransportFn> = {
  webhook: (i) => post(i.config.url, {
    title: i.title, body: i.body, severity: i.severity, kind: i.kind, source: 'knetrahub-monitoring'
  }, i.config.headers && typeof i.config.headers === 'object' ? i.config.headers : {}),

  slack: (i) => post(i.config.webhook_url, { text: `*${i.title}*\n${i.body}` }),

  discord: (i) => post(i.config.webhook_url, { content: `**${i.title}**\n${i.body}`.slice(0, 1900) }),

  telegram: (i) => post(
    `https://api.telegram.org/bot${i.config.bot_token}/sendMessage`,
    { chat_id: i.config.chat_id, text: `${i.title}\n\n${i.body}`, disable_web_page_preview: true }
  ),

  teams: (i) => post(i.config.webhook_url, {
    '@type': 'MessageCard', '@context': 'http://schema.org/extensions',
    summary: i.title, themeColor: i.severity === 'critical' ? 'D73A49' : 'F6A821',
    title: i.title, text: i.body.replace(/\n/g, '\n\n')
  }),

  mattermost: (i) => post(i.config.webhook_url, { text: `**${i.title}**\n${i.body}` }),

  rocketchat: (i) => post(i.config.webhook_url, { text: `*${i.title}*\n${i.body}` }),

  gotify: (i) => post(
    `${String(i.config.server_url).replace(/\/$/, '')}/message?token=${encodeURIComponent(i.config.app_token)}`,
    { title: i.title, message: i.body, priority: i.severity === 'critical' ? 8 : 4 }
  ),

  // ntfy wants a raw text body + header metadata — implemented below, after
  // the map literal, to reuse the guarded fetch pattern.
  ntfy: undefined as unknown as TransportFn,

  pushover: (i) => post('https://api.pushover.net/1/messages.json', {
    token: i.config.api_token, user: i.config.user_key,
    title: i.title, message: i.body, priority: i.severity === 'critical' ? 1 : 0
  }),

  pagerduty: (i) => post('https://events.pagerduty.com/v2/enqueue', {
    routing_key: i.config.routing_key,
    event_action: i.kind === 'recovery' ? 'resolve' : 'trigger',
    dedup_key: i.config.dedup_key,
    payload: {
      summary: i.title.slice(0, 1024),
      source: 'knetrahub-monitoring',
      severity: i.severity === 'critical' ? 'critical' : 'warning',
      custom_details: { body: i.body }
    }
  }),

  opsgenie: (i) => post('https://api.opsgenie.com/v2/alerts', {
    message: i.title.slice(0, 130), description: i.body.slice(0, 15000),
    priority: i.severity === 'critical' ? 'P1' : 'P3'
  }, { authorization: `GenieKey ${i.config.api_key}` }),

  smtp: (i) => sendSmtp(i)
}

// ntfy needs a text body + headers rather than JSON; override cleanly.
TRANSPORTS.ntfy = async (i) => {
  const base = `${String(i.config.server_url ?? 'https://ntfy.sh').replace(/\/$/, '')}/${i.config.topic}`
  const target = guardUrl(base)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(target, {
      method: 'POST',
      headers: { title: i.title.replace(/[^\x20-\x7e]/g, ' '), priority: i.severity === 'critical' ? 'high' : 'default' },
      body: i.body,
      signal: controller.signal
    })
    return { ok: res.ok, target: redactUrl(base), requestSummary: `POST ${redactUrl(base)}`, status: res.status, error: res.ok ? undefined : `HTTP ${res.status}` }
  } catch (err: any) {
    return { ok: false, target: redactUrl(base), requestSummary: `POST ${redactUrl(base)}`, error: String(err?.message ?? err) }
  } finally {
    clearTimeout(timer)
  }
}

/** Minimal SMTP client (TLS or plain, AUTH LOGIN) — no new dependency. */
async function sendSmtp(i: DeliveryInput): Promise<DeliveryResult> {
  const { host, port = 587, secure = false, username, password, from, to } = i.config
  const target = `${host}:${port} → ${String(to).replace(/(.).*(@.*)/, '$1…$2')}`
  try {
    const net = await import('node:net')
    const tls = await import('node:tls')
    const socket: any = await new Promise((resolve, reject) => {
      const s = secure
        ? tls.connect({ host, port: Number(port), timeout: FETCH_TIMEOUT_MS }, () => resolve(s))
        : net.connect({ host, port: Number(port), timeout: FETCH_TIMEOUT_MS }, () => resolve(s))
      s.on('error', reject)
      s.setTimeout(FETCH_TIMEOUT_MS, () => reject(new Error('smtp timeout')))
    })

    const read = () => new Promise<string>((resolve, reject) => {
      socket.once('data', (d: Buffer) => resolve(d.toString()))
      socket.once('error', reject)
    })
    const send = async (line: string, expect?: number) => {
      socket.write(line + '\r\n')
      const reply = await read()
      const code = Number(reply.slice(0, 3))
      if (expect && code !== expect && code >= 400) throw new Error(`SMTP ${code} after ${line.split(' ')[0]}`)
      return reply
    }

    await read() // banner
    await send(`EHLO knetrahub`)
    if (username) {
      await send('AUTH LOGIN')
      await send(Buffer.from(String(username)).toString('base64'))
      await send(Buffer.from(String(password ?? '')).toString('base64'), 235)
    }
    await send(`MAIL FROM:<${from}>`, 250)
    for (const rcpt of String(to).split(',')) await send(`RCPT TO:<${rcpt.trim()}>`, 250)
    await send('DATA')
    const msg = [
      `From: ${from}`, `To: ${to}`, `Subject: ${i.title.replace(/[\r\n]/g, ' ')}`,
      'Content-Type: text/plain; charset=utf-8', '', i.body.replace(/^\./gm, '..'), '.'
    ].join('\r\n')
    await send(msg, 250)
    await send('QUIT')
    socket.end()
    return { ok: true, target, requestSummary: `SMTP ${host}:${port}` }
  } catch (err: any) {
    return { ok: false, target, requestSummary: `SMTP ${host}:${port}`, error: String(err?.message ?? err) }
  }
}

/** Render + deliver an alert through every transport assigned to its rule. */
export async function deliverAlert(db: Pool, args: { alert: any; rule: any; kind: 'alert' | 'recovery' | 'reminder' }): Promise<void> {
  const { alert, rule, kind } = args

  const transports = await db.query(
    `SELECT t.* FROM monitoring.alert_transports t
     LEFT JOIN monitoring.alert_rule_transports rt ON rt.transport_id = t.id AND rt.rule_id = $1
     WHERE t.enabled AND (rt.rule_id IS NOT NULL OR (t.is_default AND NOT EXISTS (
       SELECT 1 FROM monitoring.alert_rule_transports WHERE rule_id = $1
     )))`,
    [rule.id]
  )
  if (!transports.rows.length) {
    // Alerts may exist with no transport — record that notification was
    // considered and skipped, then advance the counter so reminders don't spin.
    await db.query(`UPDATE monitoring.alerts SET last_notified_at = now() WHERE id = $1`, [alert.id])
    return
  }

  const device = (await db.query(
    `SELECT d.*, l.name AS location FROM monitoring.devices d
     LEFT JOIN monitoring.locations l ON l.id = d.location_id WHERE d.id = $1`,
    [alert.device_id]
  )).rows[0] ?? {}

  const template = rule.template_id
    ? (await db.query(`SELECT * FROM monitoring.alert_templates WHERE id = $1`, [rule.template_id])).rows[0]
    : (await db.query(`SELECT * FROM monitoring.alert_templates WHERE is_default LIMIT 1`)).rows[0]

  const faulting = typeof alert.faulting === 'string' ? JSON.parse(alert.faulting || '{}') : (alert.faulting ?? {})
  const ctx: TemplateContext = {
    alert: { ...alert, faulting: undefined },
    rule,
    device: sanitize(device),
    faulting: { ...faulting, summary: Object.entries(faulting).slice(0, 10).map(([k, v]) => `${k}=${v}`).join(', ') },
    now: new Date().toISOString(),
    portal_url: ''
  }
  const prefix = kind === 'recovery' ? '[RECOVERED] ' : kind === 'reminder' ? '[STILL ACTIVE] ' : ''
  const title = prefix + renderTemplate(template?.title_template ?? DEFAULT_TITLE_TEMPLATE, ctx)
  const body = renderTemplate(template?.body_template ?? DEFAULT_BODY_TEMPLATE, ctx)

  let anySuccess = false
  for (const transport of transports.rows) {
    const startedAt = Date.now()
    let result: DeliveryResult
    try {
      const config = JSON.parse(decryptSecret(transport.config) || '{}')
      const fn = TRANSPORTS[transport.type as TransportType]
      if (!fn) throw new Error(`unknown transport type ${transport.type}`)
      result = await fn({ transportType: transport.type, config, title, body, severity: rule.severity, kind })
    } catch (err: any) {
      result = { ok: false, target: transport.name, requestSummary: transport.type, error: String(err?.message ?? err) }
    }
    anySuccess = anySuccess || result.ok
    await db.query(
      `INSERT INTO monitoring.alert_notifications
         (alert_id, transport_id, transport_type, kind, target, request_summary, response_status, response_ms, success, error)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [alert.id, transport.id, transport.type, kind, result.target, result.requestSummary,
        result.status ?? null, Date.now() - startedAt, result.ok, result.error ?? null]
    )
  }

  await db.query(
    `UPDATE monitoring.alerts SET notifications_sent = notifications_sent + 1, last_notified_at = now() WHERE id = $1`,
    [alert.id]
  )
  if (!anySuccess) {
    console.warn(`[monitoring:alerts] all transports failed for alert ${alert.id} (rule "${rule.name}")`)
  }
}

/** Test a transport with a synthetic message (admin action). */
export async function testTransport(db: Pool, transportId: number): Promise<{ ok: boolean; error?: string }> {
  const row = (await db.query(`SELECT * FROM monitoring.alert_transports WHERE id = $1`, [transportId])).rows[0]
  if (!row) return { ok: false, error: 'transport not found' }
  try {
    const config = JSON.parse(decryptSecret(row.config) || '{}')
    const fn = TRANSPORTS[row.type as TransportType]
    if (!fn) return { ok: false, error: `unknown transport type ${row.type}` }
    const result = await fn({
      transportType: row.type, config,
      title: '[TEST] KNetraHub Monitoring transport test',
      body: `This is a test notification for transport "${row.name}" (${row.type}).`,
      severity: 'warning', kind: 'test'
    })
    return { ok: result.ok, error: result.error }
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err) }
  }
}

function sanitize(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    if (/community|password|secret|token/.test(k)) continue
    out[k] = v
  }
  return out
}
