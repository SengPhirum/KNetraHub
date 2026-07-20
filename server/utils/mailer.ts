import { getEmailSettings, getEmailTemplate, type EmailSettings } from './emailSettings'
import { sendSmtpMessage } from './smtp'
import { renderEmail } from './emailRender'
import { getAppearanceSettings } from './appearanceSettings'
import { getEnvModeState } from './envModeState'
import type { EmailTemplateKey } from '../../shared/utils/emailTemplates'
import { getRequestHost, getRequestProtocol, type H3Event } from 'h3'

/**
 * Outbound email delivery policy: resolve settings, render a template, hand
 * the result to the SMTP transport in smtp.ts.
 *
 * Neither entry point throws into a caller's request path - sendMail returns
 * a result object, and sendTemplateMail additionally swallows render errors,
 * because a notification failing must never fail the user action that
 * triggered it.
 */

export interface SendMailInput {
  to: string | string[]
  subject: string
  html: string
  text: string
  /** Overrides the stored settings - used by "send test" before saving. */
  settings?: EmailSettings
}

export interface SendMailResult {
  ok: boolean
  /** Host:port → redacted recipient, safe to show in the UI and audit log. */
  target: string
  error?: string
  transcript?: string[]
}

export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  const settings = input.settings ?? (await getEmailSettings())
  const recipients = (Array.isArray(input.to) ? input.to : input.to.split(','))
    .map((r) => r.trim())
    .filter(Boolean)

  const target = `${settings.host}:${settings.port} → ${recipients.map(redactEmail).join(', ')}`

  if (!settings.enabled) return { ok: false, target, error: 'Email delivery is disabled in Admin > Configuration > Email' }
  if (!settings.host) return { ok: false, target, error: 'No SMTP host configured' }
  if (!settings.fromAddress) return { ok: false, target, error: 'No From address configured' }
  if (!recipients.length) return { ok: false, target, error: 'No recipient address' }

  const result = await sendSmtpMessage(settings, {
    to: recipients,
    subject: input.subject,
    html: input.html,
    text: input.text
  })

  return { ok: result.ok, target, error: result.error, transcript: result.transcript }
}

/**
 * Render one of the catalog templates and send it. Returns the result so
 * callers that care (the test button) can surface it, and logs otherwise.
 */
export async function sendTemplateMail(
  key: EmailTemplateKey,
  to: string | string[],
  context: Record<string, unknown> = {},
  options: { settings?: EmailSettings; event?: H3Event } = {}
): Promise<SendMailResult> {
  try {
    const [template, ctx] = await Promise.all([getEmailTemplate(key), buildBaseContext(options.event)])
    const rendered = renderEmail(template, { ...ctx, ...context })
    const result = await sendMail({
      to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      settings: options.settings
    })
    if (!result.ok) console.warn(`[mailer] "${key}" to ${result.target} failed: ${result.error}`)
    return result
  } catch (err: any) {
    console.warn(`[mailer] "${key}" failed to render/send:`, err)
    return { ok: false, target: String(to), error: String(err?.message ?? err) }
  }
}

/**
 * The app/now/year values every template can reference. `event` is optional:
 * pass it when sending from a request so links can fall back to the serving
 * host, since most deployments never set NUXT_PUBLIC_APP_URL.
 */
export async function buildBaseContext(event?: H3Event): Promise<Record<string, unknown>> {
  const [appearance, envMode] = await Promise.all([getAppearanceSettings(), getEnvModeState(event)])
  const now = new Date()
  return {
    app: {
      name: appearance.appName,
      url: resolvePortalUrl(event),
      env: envMode.mode
    },
    now: now.toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
    year: String(now.getUTCFullYear())
  }
}

/** Configured base URL wins; otherwise fall back to the serving host. */
export function resolvePortalUrl(event?: H3Event): string {
  const configured = String(useRuntimeConfig().public.appUrl || '').trim()
  if (configured) return configured.replace(/\/$/, '')
  if (!event) return ''
  try {
    const host = getRequestHost(event, { xForwardedHost: true })
    const proto = getRequestProtocol(event, { xForwardedProto: true })
    return host ? `${proto || 'https'}://${host}` : ''
  } catch {
    return ''
  }
}

function redactEmail(address: string): string {
  return address.replace(/(.).*(@.*)/, '$1…$2')
}
