import { getAppSetting, setAppSetting, deleteAppSetting } from './store'
import { encryptSecret, decryptSecret } from './secretCrypto'
import { DEFAULT_EMAIL_TEMPLATES, type EmailTemplateKey, type EmailTemplate } from '../../shared/utils/emailTemplates'

/**
 * Outbound email settings and message templates.
 *
 * Same pattern as authSettings.ts: environment variables (via runtimeConfig)
 * provide the defaults, admins override them from Admin > Configuration >
 * Email, and the override is stored as JSON in app_settings. The SMTP
 * password is AES-256-GCM encrypted at rest (secretCrypto.ts) and is never
 * returned to the browser - the API exposes a `passwordSet` boolean instead.
 *
 * Templates live under a separate key so saving the transport config never
 * rewrites message bodies (and vice versa). Only templates the admin has
 * actually customised are stored; everything else falls through to the
 * built-in catalog in shared/utils/emailTemplates.ts, which means default
 * wording improvements ship with an upgrade instead of being frozen in the DB.
 */

export type SmtpEncryption = 'none' | 'starttls' | 'ssl'

export interface EmailSettings {
  /** Master switch. When false nothing is sent, even if the host is valid. */
  enabled: boolean
  host: string
  port: number
  encryption: SmtpEncryption
  /** Empty username means "no AUTH" (an open internal relay). */
  username: string
  password: string
  /** Display name on the From header, e.g. "KNetraHub". Optional. */
  fromName: string
  fromAddress: string
  /** Optional Reply-To; blank means recipients reply to fromAddress. */
  replyTo: string
  /** Accept self-signed / mismatched certs. Internal relays only. */
  allowInsecureTls: boolean
}

const KEY = 'email'
const TEMPLATES_KEY = 'email.templates'

const ENCRYPTIONS: SmtpEncryption[] = ['none', 'starttls', 'ssl']

/** Config/built-in defaults only - no DB read. */
export function defaultEmailSettings(): EmailSettings {
  const c = useRuntimeConfig().smtp
  return normalizeEmailSettings({
    enabled: c.enabled,
    host: c.host,
    port: c.port,
    encryption: c.encryption as SmtpEncryption,
    username: c.username,
    password: c.password,
    fromName: c.fromName,
    fromAddress: c.fromAddress,
    replyTo: c.replyTo,
    allowInsecureTls: c.allowInsecureTls
  })
}

async function readOverrides(): Promise<Partial<EmailSettings> | null> {
  const raw = await getAppSetting(KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    // Only the DB override is encrypted; env-sourced defaults are plaintext.
    if (typeof parsed.password === 'string') parsed.password = decryptSecret(parsed.password)
    return parsed as Partial<EmailSettings>
  } catch {
    return null
  }
}

export async function getEmailSettings(): Promise<EmailSettings> {
  return normalizeEmailSettings({ ...defaultEmailSettings(), ...(await readOverrides()) })
}

export async function hasEmailOverride(): Promise<boolean> {
  return (await getAppSetting(KEY)) !== null
}

/** Persist a partial update; a blank password keeps the current one. */
export async function saveEmailSettings(patch: Partial<EmailSettings>, actor: string): Promise<EmailSettings> {
  const current = await getEmailSettings()
  const next = normalizeEmailSettings({ ...current, ...patch })
  if (!patch.password) next.password = current.password
  const stored = { ...next, password: next.password ? encryptSecret(next.password) : '' }
  await setAppSetting(KEY, JSON.stringify(stored), actor)
  return next
}

/** Drop the DB override so email follows the environment again. */
export async function resetEmailSettings(): Promise<void> {
  await deleteAppSetting(KEY)
}

function normalizeEmailSettings(input: EmailSettings): EmailSettings {
  const port = Number(input.port)
  return {
    enabled: input.enabled === true,
    host: String(input.host ?? '').trim(),
    port: Number.isFinite(port) ? Math.min(65535, Math.max(1, Math.round(port))) : 587,
    encryption: ENCRYPTIONS.includes(input.encryption) ? input.encryption : 'starttls',
    username: String(input.username ?? '').trim(),
    password: String(input.password ?? ''),
    fromName: String(input.fromName ?? '').trim(),
    fromAddress: String(input.fromAddress ?? '').trim(),
    replyTo: String(input.replyTo ?? '').trim(),
    allowInsecureTls: input.allowInsecureTls === true
  }
}

// ─── templates ────────────────────────────────────────────────────────────────

/** The admin-editable half of a template; the rest (name, description, sample
 *  context, variable list) is fixed by the catalog and never stored. */
export interface EmailTemplateOverride {
  subject: string
  format: 'markdown' | 'html'
  body: string
}

async function readTemplateOverrides(): Promise<Partial<Record<EmailTemplateKey, EmailTemplateOverride>>> {
  const raw = await getAppSetting(TEMPLATES_KEY)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Partial<Record<EmailTemplateKey, EmailTemplateOverride>> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (!(key in DEFAULT_EMAIL_TEMPLATES)) continue
      const sanitized = sanitizeOverride(value)
      if (sanitized) out[key as EmailTemplateKey] = sanitized
    }
    return out
  } catch {
    return {}
  }
}

function sanitizeOverride(value: unknown): EmailTemplateOverride | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  if (typeof v.subject !== 'string' || typeof v.body !== 'string') return null
  return {
    subject: v.subject,
    format: v.format === 'html' ? 'html' : 'markdown',
    body: v.body
  }
}

/** A catalog template merged with its stored override (if any). */
export interface ResolvedEmailTemplate extends EmailTemplate {
  /** True when an admin has saved a customised version of this template. */
  customized: boolean
}

export async function listEmailTemplates(): Promise<ResolvedEmailTemplate[]> {
  const overrides = await readTemplateOverrides()
  return (Object.keys(DEFAULT_EMAIL_TEMPLATES) as EmailTemplateKey[]).map((key) => {
    const base = DEFAULT_EMAIL_TEMPLATES[key]
    const override = overrides[key]
    return { ...base, ...(override ?? {}), customized: Boolean(override) }
  })
}

export async function getEmailTemplate(key: EmailTemplateKey): Promise<ResolvedEmailTemplate> {
  const base = DEFAULT_EMAIL_TEMPLATES[key]
  if (!base) throw createError({ statusCode: 404, statusMessage: `Unknown email template "${key}"` })
  const override = (await readTemplateOverrides())[key]
  return { ...base, ...(override ?? {}), customized: Boolean(override) }
}

export async function saveEmailTemplate(key: EmailTemplateKey, patch: EmailTemplateOverride, actor: string): Promise<ResolvedEmailTemplate> {
  if (!(key in DEFAULT_EMAIL_TEMPLATES)) {
    throw createError({ statusCode: 404, statusMessage: `Unknown email template "${key}"` })
  }
  const overrides = await readTemplateOverrides()
  overrides[key] = patch
  await setAppSetting(TEMPLATES_KEY, JSON.stringify(overrides), actor)
  return getEmailTemplate(key)
}

/** Drop one template's override so it follows the built-in default again. */
export async function resetEmailTemplate(key: EmailTemplateKey, actor: string): Promise<ResolvedEmailTemplate> {
  const overrides = await readTemplateOverrides()
  delete overrides[key]
  if (Object.keys(overrides).length) await setAppSetting(TEMPLATES_KEY, JSON.stringify(overrides), actor)
  else await deleteAppSetting(TEMPLATES_KEY)
  return getEmailTemplate(key)
}
