/**
 * The built-in catalog of outbound email templates.
 *
 * Shared between server (rendering + sending) and client (the editor in
 * Admin > Configuration > Email), so the variable lists shown to an admin are
 * exactly the ones the renderer will substitute.
 *
 * Each template's `body` is authored in Markdown by default because that
 * survives editing by non-developers; an admin can switch any template to
 * `html` and hand-write the markup instead. Both are rendered to an HTML
 * message with an auto-generated plain-text alternative (see
 * server/utils/emailRender.ts).
 *
 * Placeholders use {{ dotted.path }} interpolation over a fixed context
 * object - no code execution, unknown paths render empty.
 */

export type EmailTemplateKey =
  | 'welcome'
  | 'password-changed'
  | 'new-login'
  | 'alert'
  | 'test'

export interface EmailTemplateVariable {
  /** The dotted path as written in a template, without the braces. */
  path: string
  description: string
}

export interface EmailTemplate {
  key: EmailTemplateKey
  /** Human label in the template list. */
  name: string
  /** When this message is sent, shown under the label. */
  description: string
  subject: string
  format: 'markdown' | 'html'
  body: string
  /** Placeholders available to this template, offered as click-to-insert chips. */
  variables: EmailTemplateVariable[]
  /** Values used for the live preview and the "send test" of this template. */
  sample: Record<string, unknown>
}

/** Variables every template can use, appended to each template's own list. */
export const COMMON_EMAIL_VARIABLES: EmailTemplateVariable[] = [
  { path: 'app.name', description: 'Application name from Admin > Appearance' },
  { path: 'app.url', description: 'Base URL of this portal' },
  { path: 'app.env', description: 'Deployment mode (production, staging, …)' },
  { path: 'now', description: 'Current date and time (UTC)' },
  { path: 'year', description: 'Current year, e.g. for a footer' }
]

const COMMON_SAMPLE = {
  app: { name: 'KNetraHub', url: 'https://knetrahub.example.com', env: 'production' },
  now: '2026-07-20 09:30 UTC',
  year: '2026'
}

export const DEFAULT_EMAIL_TEMPLATES: Record<EmailTemplateKey, EmailTemplate> = {
  welcome: {
    key: 'welcome',
    name: 'Welcome / account created',
    description: 'Sent to a new local user when an administrator creates their account.',
    subject: 'Your {{app.name}} account is ready',
    format: 'markdown',
    body: [
      '# Welcome, {{user.displayName}}',
      '',
      'An account has been created for you on **{{app.name}}**.',
      '',
      '- **Username:** {{user.username}}',
      '- **Role:** {{user.role}}',
      '- **Created by:** {{actor}}',
      '',
      '[Sign in to {{app.name}}]({{app.url}})',
      '',
      'If you were not expecting this email, please contact your administrator.',
      '',
      '---',
      '',
      '{{app.name}} · {{year}}'
    ].join('\n'),
    variables: [
      { path: 'user.displayName', description: "The new user's display name" },
      { path: 'user.username', description: 'Login username' },
      { path: 'user.email', description: "The new user's email address" },
      { path: 'user.role', description: 'Assigned portal role' },
      { path: 'actor', description: 'Administrator who created the account' }
    ],
    sample: {
      ...COMMON_SAMPLE,
      user: { displayName: 'Dara Sok', username: 'dara.sok', email: 'dara.sok@example.com', role: 'operator' },
      actor: 'admin'
    }
  },

  'password-changed': {
    key: 'password-changed',
    name: 'Password changed',
    description: "Confirmation sent after a local account's password is changed or reset.",
    subject: 'Your {{app.name}} password was changed',
    format: 'markdown',
    body: [
      '# Password changed',
      '',
      'Hi {{user.displayName}},',
      '',
      'The password for your **{{app.name}}** account (`{{user.username}}`) was changed on **{{now}}**.',
      '',
      '- **Changed by:** {{actor}}',
      '- **From address:** {{request.ip}}',
      '',
      "If you made this change, no action is needed. If you did not, contact your administrator immediately - your account may be compromised.",
      '',
      '---',
      '',
      '{{app.name}} · {{year}}'
    ].join('\n'),
    variables: [
      { path: 'user.displayName', description: "Account holder's display name" },
      { path: 'user.username', description: 'Login username' },
      { path: 'actor', description: 'Who performed the change (the user, or an admin)' },
      { path: 'request.ip', description: 'Source IP of the change' }
    ],
    sample: {
      ...COMMON_SAMPLE,
      user: { displayName: 'Dara Sok', username: 'dara.sok', email: 'dara.sok@example.com' },
      actor: 'dara.sok',
      request: { ip: '10.20.4.87' }
    }
  },

  'new-login': {
    key: 'new-login',
    name: 'New sign-in detected',
    description: 'Sent when a user signs in from a new device or location (Preferences > Notifications).',
    subject: 'New sign-in to your {{app.name}} account',
    format: 'markdown',
    body: [
      '# New sign-in',
      '',
      'Hi {{user.displayName}},',
      '',
      'Your **{{app.name}}** account was signed in to.',
      '',
      '- **When:** {{now}}',
      '- **IP address:** {{request.ip}}',
      '- **Device:** {{request.userAgent}}',
      '- **Method:** {{request.method}}',
      '',
      'If this was you, you can ignore this message. Otherwise, change your password and review your active sessions:',
      '',
      '[Review active sessions]({{app.url}}/preferences/sessions)',
      '',
      '---',
      '',
      '{{app.name}} · {{year}}'
    ].join('\n'),
    variables: [
      { path: 'user.displayName', description: "Account holder's display name" },
      { path: 'user.username', description: 'Login username' },
      { path: 'request.ip', description: 'Source IP of the sign-in' },
      { path: 'request.userAgent', description: 'Browser / device string' },
      { path: 'request.method', description: 'Local password, LDAP, or SSO' }
    ],
    sample: {
      ...COMMON_SAMPLE,
      user: { displayName: 'Dara Sok', username: 'dara.sok', email: 'dara.sok@example.com' },
      request: { ip: '10.20.4.87', userAgent: 'Chrome 139 on Windows 11', method: 'Local password' }
    }
  },

  alert: {
    key: 'alert',
    name: 'Alert notification',
    description: 'Sent for monitoring alerts and action outcomes routed to email.',
    subject: '[{{alert.severity}}] {{alert.title}}',
    format: 'markdown',
    body: [
      '# {{alert.title}}',
      '',
      '**Severity:** {{alert.severity}}  ',
      '**Source:** {{alert.source}}  ',
      '**Opened:** {{alert.openedAt}}',
      '',
      '{{alert.message}}',
      '',
      '[Open in {{app.name}}]({{alert.url}})',
      '',
      '---',
      '',
      '{{app.name}} · {{year}}'
    ].join('\n'),
    variables: [
      { path: 'alert.title', description: 'Short alert headline' },
      { path: 'alert.severity', description: 'critical, warning, or info' },
      { path: 'alert.source', description: 'Device, service, or app that raised it' },
      { path: 'alert.message', description: 'Full alert body' },
      { path: 'alert.openedAt', description: 'When the alert opened' },
      { path: 'alert.url', description: 'Deep link to the alert in the portal' }
    ],
    sample: {
      ...COMMON_SAMPLE,
      alert: {
        title: 'CPU above 90% for 10 minutes',
        severity: 'critical',
        source: 'edge-sw-01.example.com',
        message: 'Processor load has stayed above the 90% threshold since 09:18 UTC. Current value: 96%.',
        openedAt: '2026-07-20 09:18 UTC',
        url: 'https://knetrahub.example.com/monitoring/alerts'
      }
    }
  },

  test: {
    key: 'test',
    name: 'Test message',
    description: 'Used by the "Send test email" button on the General tab to verify SMTP delivery.',
    subject: '{{app.name}} SMTP test message',
    format: 'markdown',
    body: [
      '# SMTP is working',
      '',
      'This is a test message from **{{app.name}}**.',
      '',
      '- **Sent:** {{now}}',
      '- **Environment:** {{app.env}}',
      '- **Requested by:** {{actor}}',
      '- **Relay:** {{smtp.host}}:{{smtp.port}} ({{smtp.encryption}})',
      '',
      'If you received this, outbound email is configured correctly.',
      '',
      '---',
      '',
      '{{app.name}} · {{year}}'
    ].join('\n'),
    variables: [
      { path: 'actor', description: 'Administrator who sent the test' },
      { path: 'smtp.host', description: 'Configured SMTP host' },
      { path: 'smtp.port', description: 'Configured SMTP port' },
      { path: 'smtp.encryption', description: 'none, starttls, or ssl' }
    ],
    sample: {
      ...COMMON_SAMPLE,
      actor: 'admin',
      smtp: { host: 'smtp.example.com', port: 587, encryption: 'starttls' }
    }
  }
}

export const EMAIL_TEMPLATE_KEYS = Object.keys(DEFAULT_EMAIL_TEMPLATES) as EmailTemplateKey[]

/** Every placeholder an admin may use in a given template. */
export function variablesForTemplate(template: EmailTemplate): EmailTemplateVariable[] {
  return [...template.variables, ...COMMON_EMAIL_VARIABLES]
}
