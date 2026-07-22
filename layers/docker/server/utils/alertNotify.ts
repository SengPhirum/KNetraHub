import { nanoid } from 'nanoid'
import { getDockerDb } from '~~/server/utils/moduleDb'
import { getAlertRule, renderTemplate, type AlertRuleType } from './alertRules'
import { channelsForScope } from '~~/server/utils/notifyStore'
import { deliverToChannel } from '~~/server/utils/notify'
import { recordNotification } from '~~/server/utils/notificationFeed'
import { logSystem } from '~~/server/utils/moduleLogs'

export interface TelegramConfig { botToken: string; chatId: string }
export interface TeamsConfig { webhookUrl: string }
export interface WebhookConfig { url: string; headers?: Record<string, string> }

export async function sendTelegram(config: TelegramConfig, message: string): Promise<void> {
  await $fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
    method: 'POST',
    body: { chat_id: config.chatId, text: message },
    timeout: 8000
  } as any)
}

export async function sendTeams(config: TeamsConfig, message: string): Promise<void> {
  await $fetch(config.webhookUrl, {
    method: 'POST',
    body: { '@type': 'MessageCard', '@context': 'http://schema.org/extensions', text: message },
    timeout: 8000
  } as any)
}

export async function sendWebhook(config: WebhookConfig, message: string): Promise<void> {
  await $fetch(config.url, {
    method: 'POST',
    headers: config.headers || {},
    body: { text: message },
    timeout: 8000
  } as any)
}

export async function notifyChannel(channel: { type: string; config: any }, message: string): Promise<void> {
  if (channel.type === 'telegram') return sendTelegram(channel.config, message)
  if (channel.type === 'teams') return sendTeams(channel.config, message)
  if (channel.type === 'webhook') return sendWebhook(channel.config, message)
  throw new Error(`Unknown channel type: ${channel.type}`)
}

export interface FireAlertInput {
  ruleType: AlertRuleType
  target?: string
  severity: 'critical' | 'warning' | 'info'
  vars: Record<string, string>
}

/**
 * Looks up the rule (no-op if disabled), records one alert_events row, then
 * notifies every enabled channel via Promise.allSettled. Never throws - this
 * is called from deploy/redeploy/scale catch blocks that are already mid-
 * handling a real error, and a notification failure must not mask it.
 */
export async function fireAlert(input: FireAlertInput): Promise<void> {
  try {
    const rule = await getAlertRule(input.ruleType)
    if (!rule.enabled) return

    const message = renderTemplate(rule.template, { ...input.vars, target: input.target ?? input.vars.target ?? '' })

    await getDockerDb().query(
      'INSERT INTO alert_events (id, rule_type, target, severity, message, fired_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [nanoid(), input.ruleType, input.target ?? null, input.severity, message, new Date().toISOString()]
    ).catch((err: any) => logSystem('portal', 'error', 'alert.record.failed',
      `Could not record alert_events row for ${input.ruleType}: ${err?.message || err}`))

    // Deliver through the central notification library: Global + Docker-scoped
    // enabled channels (config already decrypted). Legacy Docker alert_channels
    // are copied in by the notificationsBackfill startup plugin.
    const enabled = await channelsForScope('docker').catch(() => [])
    const notifyMsg = {
      title: `[${input.severity.toUpperCase()}] ${input.ruleType.replace(/_/g, ' ')}${input.target ? ` — ${input.target}` : ''}`,
      body: message,
      severity: input.severity,
      kind: 'alert' as const
    }

    // Central in-portal feed (navbar bell), alongside the Docker-DB alert_events
    // row above — the feed is cross-app and drives the in-app notification list.
    await recordNotification({
      app: 'docker',
      severity: input.severity,
      title: `${input.ruleType.replace(/_/g, ' ')}${input.target ? ` — ${input.target}` : ''}`,
      body: message,
      ruleType: input.ruleType,
      target: input.target ?? null
    })
    let delivered = 0
    for (const channel of enabled) {
      const res = await deliverToChannel(channel, notifyMsg)
      if (res.ok) delivered++
      // A silently-dead notification channel is worse than a noisy one.
      else await logSystem('portal', 'error', 'alert.notify.failed',
        `Channel "${channel.name}" (${channel.type}) failed for ${input.ruleType}: ${res.error}`)
    }
    await logSystem('portal', 'info', 'alert.fired',
      `${input.severity.toUpperCase()} ${input.ruleType}${input.target ? ` "${input.target}"` : ''} - notified ${delivered}/${enabled.length} channel(s)`)
  } catch (err: any) {
    // logSystem never throws - it falls back to console on DB failure.
    await logSystem('portal', 'error', 'alert.fire.failed', `fireAlert(${input.ruleType}) failed: ${err?.message || err}`)
  }
}
