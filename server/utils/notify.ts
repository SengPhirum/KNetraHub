import { getEmailSettings } from './emailSettings'
import { sendMail } from './mailer'
import { markdownToHtml } from './emailRender'
import { NOTIFICATION_TEMPLATE_MAX, type NotificationChannelType } from '../../shared/utils/notifications'

/**
 * The single notification delivery engine (KNetraHub). Every non-email
 * transport is fetch-based with a strict timeout and an SSRF guard; email
 * routes through the central portal mailer so SMTP lives in exactly one place.
 * Configs are decrypted by the caller (notifyStore) and never logged in full.
 *
 * This is promoted from the monitoring transport plugins so Docker, Monitoring
 * and any future app share one code path.
 */

export interface NotifyMessage {
  title: string
  body: string
  severity: 'critical' | 'warning' | 'info'
  kind: 'alert' | 'recovery' | 'reminder' | 'test'
}

export interface DeliveryResult {
  ok: boolean
  target: string
  error?: string
}

const FETCH_TIMEOUT_MS = 10_000

/** Block non-http(s) and cloud-metadata / internal destinations. */
function guardUrl(raw: string): URL {
  const url = new URL(raw)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('only http(s) URLs are allowed')
  const host = url.hostname
  if (host === '169.254.169.254' || host === 'metadata.google.internal' || host.endsWith('.internal')) {
    throw new Error('blocked destination')
  }
  return url
}

function redactUrl(raw: string): string {
  try {
    const url = new URL(raw)
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
    return { ok: res.ok, target: redactUrl(url), error: res.ok ? undefined : `HTTP ${res.status}` }
  } catch (err: any) {
    return { ok: false, target: redactUrl(url), error: String(err?.message ?? err) }
  } finally {
    clearTimeout(timer)
  }
}

function parseHeaders(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'string') return {}
  try {
    const obj = JSON.parse(raw)
    return obj && typeof obj === 'object' ? obj : {}
  } catch {
    return {}
  }
}

/** Email delivery goes through the central mailer; the channel config only
 *  supplies recipients and an optional From-name override. */
async function deliverEmail(config: Record<string, any>, msg: NotifyMessage): Promise<DeliveryResult> {
  const to = String(config.to ?? '').trim()
  if (!to) return { ok: false, target: 'email', error: 'No recipients configured' }
  const base = await getEmailSettings()
  const settings = config.fromName ? { ...base, fromName: String(config.fromName) } : base
  const html = markdownToHtml(msg.body)
  const res = await sendMail({ to, subject: msg.title, text: msg.body, html, settings })
  return { ok: res.ok, target: res.target, error: res.error }
}

type HttpTransport = (config: Record<string, any>, msg: NotifyMessage) => Promise<DeliveryResult>

const HTTP_TRANSPORTS: Record<Exclude<NotificationChannelType, 'email'>, HttpTransport> = {
  webhook: (c, m) => post(c.url, { title: m.title, body: m.body, severity: m.severity, kind: m.kind, source: 'knetrahub' }, parseHeaders(c.headers)),
  slack: (c, m) => post(c.webhook_url, { text: `*${m.title}*\n${m.body}` }),
  discord: (c, m) => post(c.webhook_url, { content: `**${m.title}**\n${m.body}`.slice(0, 1900) }),
  telegram: (c, m) => post(`https://api.telegram.org/bot${c.bot_token}/sendMessage`, { chat_id: c.chat_id, text: `${m.title}\n\n${m.body}`, disable_web_page_preview: true }),
  teams: (c, m) => post(c.webhook_url, {
    '@type': 'MessageCard', '@context': 'http://schema.org/extensions',
    summary: m.title, themeColor: m.severity === 'critical' ? 'D73A49' : 'F6A821',
    title: m.title, text: m.body.replace(/\n/g, '\n\n')
  }),
  mattermost: (c, m) => post(c.webhook_url, { text: `**${m.title}**\n${m.body}` }),
  rocketchat: (c, m) => post(c.webhook_url, { text: `*${m.title}*\n${m.body}` }),
  gotify: (c, m) => post(`${String(c.server_url).replace(/\/$/, '')}/message?token=${c.app_token}`, { title: m.title, message: m.body, priority: m.severity === 'critical' ? 8 : 4 }),
  ntfy: async (c, m) => {
    const base = `${String(c.server_url ?? 'https://ntfy.sh').replace(/\/$/, '')}/${c.topic}`
    const url = guardUrl(base)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { title: m.title.replace(/[^\x20-\x7e]/g, ' '), priority: m.severity === 'critical' ? 'high' : 'default' },
        body: m.body,
        signal: controller.signal
      })
      return { ok: res.ok, target: redactUrl(base), error: res.ok ? undefined : `HTTP ${res.status}` }
    } catch (err: any) {
      return { ok: false, target: redactUrl(base), error: String(err?.message ?? err) }
    } finally {
      clearTimeout(timer)
    }
  },
  pushover: (c, m) => post('https://api.pushover.net/1/messages.json', { token: c.api_token, user: c.user_key, title: m.title, message: m.body, priority: m.severity === 'critical' ? 1 : 0 }),
  pagerduty: (c, m) => post('https://events.pagerduty.com/v2/enqueue', {
    routing_key: c.routing_key,
    event_action: m.kind === 'recovery' ? 'resolve' : 'trigger',
    dedup_key: c.dedup_key || undefined,
    payload: { summary: m.title.slice(0, 1024), source: 'knetrahub', severity: m.severity === 'critical' ? 'critical' : 'warning', custom_details: { body: m.body } }
  }),
  opsgenie: (c, m) => post('https://api.opsgenie.com/v2/alerts', { message: m.title.slice(0, 130), description: m.body.slice(0, 15000), priority: m.severity === 'critical' ? 'P1' : 'P3' }, { authorization: `GenieKey ${c.api_key}` })
}

/** Deliver one message to one already-decrypted channel. Never throws. */
export async function deliverToChannel(
  channel: { type: string; config: Record<string, any> },
  msg: NotifyMessage
): Promise<DeliveryResult> {
  try {
    if (channel.type === 'email') return await deliverEmail(channel.config, msg)
    const fn = HTTP_TRANSPORTS[channel.type as Exclude<NotificationChannelType, 'email'>]
    if (!fn) return { ok: false, target: channel.type, error: `Unknown channel type: ${channel.type}` }
    return await fn(channel.config, msg)
  } catch (err: any) {
    return { ok: false, target: channel.type, error: String(err?.message ?? err) }
  }
}

/** Safe {{path}} interpolation over a flat context - no code execution, unknown
 *  keys render empty, output is length-bounded. */
export function renderNotification(template: string, ctx: Record<string, unknown>): string {
  const out = template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, key: string) => {
    const v = ctx[key]
    return v == null ? '' : String(v)
  })
  return out.length > NOTIFICATION_TEMPLATE_MAX ? out.slice(0, NOTIFICATION_TEMPLATE_MAX) + '…' : out
}
