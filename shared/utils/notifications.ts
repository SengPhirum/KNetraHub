/**
 * Centralized notification model, shared by the Admin library and every
 * sub-app. A channel is one delivery destination (a webhook, a chat bot,
 * email …). A template is the reusable wording of a message (title + body).
 *
 * `scope` says who owns a record: 'global' = shared across the whole portal,
 * or an app key (docker | monitoring | ipmgt) = created inside that app and
 * tagged with its name. Both the API guard and the pickers read this.
 *
 * Email is special: the SMTP server is portal infrastructure configured once
 * in Admin ▸ Configuration ▸ Email. An `email` channel therefore only carries
 * recipients and an optional From-name override - never server credentials.
 */

export const NOTIFICATION_SCOPE_GLOBAL = 'global' as const

/** App keys that can own a scoped channel/template, plus their display label.
 *  'portal' isn't a channel scope — it tags notifications raised by the admin
 *  portal's own alert engine in the central feed (the navbar bell). */
export const NOTIFICATION_APP_LABELS: Record<string, string> = {
  global: 'Global',
  portal: 'Portal',
  docker: 'Dock',
  monitoring: 'Monitoring',
  ipmgt: 'IP Management'
}

export function scopeLabel(scope: string): string {
  return NOTIFICATION_APP_LABELS[scope] ?? scope
}

/** Every built-in channel type. `email` routes through the central mailer; the
 *  rest are fetch-based (HTTP) delivery. Order drives the picker. */
export const NOTIFICATION_CHANNEL_TYPES = [
  'email', 'webhook', 'slack', 'discord', 'telegram', 'teams',
  'mattermost', 'rocketchat', 'gotify', 'ntfy', 'pushover', 'pagerduty', 'opsgenie'
] as const
export type NotificationChannelType = (typeof NOTIFICATION_CHANNEL_TYPES)[number]

export interface ChannelField {
  key: string
  label: string
  kind: 'text' | 'password' | 'number' | 'boolean'
  required?: boolean
  placeholder?: string
  help?: string
}

export interface ChannelTypeMeta {
  label: string
  icon: string
  /** One-line description shown under the type in the picker. */
  blurb: string
  fields: ChannelField[]
}

/** Field spec per type - the channel form and the server validation both read
 *  this, so there is one source of truth for what each destination needs. */
export const CHANNEL_TYPE_META: Record<NotificationChannelType, ChannelTypeMeta> = {
  email: {
    label: 'Email', icon: 'i-lucide-mail',
    blurb: 'Sends through the portal SMTP server; only recipients and sender name here.',
    fields: [
      { key: 'to', label: 'Recipients', kind: 'text', required: true, placeholder: 'ops@example.com, oncall@example.com', help: 'Comma-separated addresses.' },
      { key: 'fromName', label: 'From name (optional)', kind: 'text', placeholder: 'Leave blank to use the portal default', help: 'Overrides the display name only - the SMTP server stays as configured in Admin ▸ Email.' }
    ]
  },
  webhook: {
    label: 'Webhook', icon: 'i-lucide-webhook',
    blurb: 'POSTs a JSON payload to any URL.',
    fields: [
      { key: 'url', label: 'URL', kind: 'text', required: true, placeholder: 'https://example.com/hooks/alerts' },
      { key: 'headers', label: 'Headers (optional)', kind: 'text', placeholder: '{"Authorization":"Bearer …"}', help: 'JSON object of extra request headers.' }
    ]
  },
  slack: {
    label: 'Slack', icon: 'i-lucide-slack',
    blurb: 'Slack incoming webhook.',
    fields: [{ key: 'webhook_url', label: 'Webhook URL', kind: 'text', required: true, placeholder: 'https://hooks.slack.com/services/…' }]
  },
  discord: {
    label: 'Discord', icon: 'i-lucide-message-circle',
    blurb: 'Discord channel webhook.',
    fields: [{ key: 'webhook_url', label: 'Webhook URL', kind: 'text', required: true, placeholder: 'https://discord.com/api/webhooks/…' }]
  },
  telegram: {
    label: 'Telegram', icon: 'i-lucide-send',
    blurb: 'A Telegram bot posting to a chat.',
    fields: [
      { key: 'bot_token', label: 'Bot token', kind: 'password', required: true, placeholder: '123456:ABC-DEF…' },
      { key: 'chat_id', label: 'Chat ID', kind: 'text', required: true, placeholder: '-1001234567890' }
    ]
  },
  teams: {
    label: 'Microsoft Teams', icon: 'i-lucide-users',
    blurb: 'Teams incoming webhook (MessageCard).',
    fields: [{ key: 'webhook_url', label: 'Webhook URL', kind: 'text', required: true, placeholder: 'https://outlook.office.com/webhook/…' }]
  },
  mattermost: {
    label: 'Mattermost', icon: 'i-lucide-message-square',
    blurb: 'Mattermost incoming webhook.',
    fields: [{ key: 'webhook_url', label: 'Webhook URL', kind: 'text', required: true, placeholder: 'https://mm.example.com/hooks/…' }]
  },
  rocketchat: {
    label: 'Rocket.Chat', icon: 'i-lucide-rocket',
    blurb: 'Rocket.Chat incoming webhook.',
    fields: [{ key: 'webhook_url', label: 'Webhook URL', kind: 'text', required: true, placeholder: 'https://chat.example.com/hooks/…' }]
  },
  gotify: {
    label: 'Gotify', icon: 'i-lucide-bell-ring',
    blurb: 'Self-hosted Gotify push server.',
    fields: [
      { key: 'server_url', label: 'Server URL', kind: 'text', required: true, placeholder: 'https://gotify.example.com' },
      { key: 'app_token', label: 'App token', kind: 'password', required: true }
    ]
  },
  ntfy: {
    label: 'ntfy', icon: 'i-lucide-radio',
    blurb: 'ntfy.sh or a self-hosted ntfy topic.',
    fields: [
      { key: 'server_url', label: 'Server URL', kind: 'text', placeholder: 'https://ntfy.sh', help: 'Defaults to https://ntfy.sh.' },
      { key: 'topic', label: 'Topic', kind: 'text', required: true, placeholder: 'knetrahub-alerts' }
    ]
  },
  pushover: {
    label: 'Pushover', icon: 'i-lucide-smartphone',
    blurb: 'Pushover mobile push.',
    fields: [
      { key: 'api_token', label: 'API token', kind: 'password', required: true },
      { key: 'user_key', label: 'User / group key', kind: 'text', required: true }
    ]
  },
  pagerduty: {
    label: 'PagerDuty', icon: 'i-lucide-siren',
    blurb: 'PagerDuty Events API v2.',
    fields: [
      { key: 'routing_key', label: 'Routing key', kind: 'password', required: true },
      { key: 'dedup_key', label: 'Dedup key (optional)', kind: 'text', help: 'Group related events under one incident.' }
    ]
  },
  opsgenie: {
    label: 'Opsgenie', icon: 'i-lucide-alarm-clock',
    blurb: 'Atlassian Opsgenie alerts.',
    fields: [{ key: 'api_key', label: 'API key', kind: 'password', required: true }]
  }
}

/** Which config keys are secret, so the API can redact them in list responses. */
export function secretFieldKeys(type: NotificationChannelType): string[] {
  return (CHANNEL_TYPE_META[type]?.fields ?? []).filter((f) => f.kind === 'password').map((f) => f.key)
}

export function channelTypeLabel(type: string): string {
  return CHANNEL_TYPE_META[type as NotificationChannelType]?.label ?? type
}

export const NOTIFICATION_TEMPLATE_MAX = 8000

/** Seeded on first run so there's always a usable default to reference. */
export const DEFAULT_NOTIFICATION_TEMPLATE = {
  name: 'Default alert',
  title: '[{{severity}}] {{title}}',
  body: [
    '{{message}}',
    '',
    'Source: {{app}}',
    'When: {{time}}'
  ].join('\n')
}
