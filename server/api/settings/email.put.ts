import { requireRole } from '~~/server/utils/auth'
import { getEmailSettings, saveEmailSettings, type EmailSettings, type SmtpEncryption } from '~~/server/utils/emailSettings'
import { audit } from '~~/server/utils/store'

const ENCRYPTIONS: SmtpEncryption[] = ['none', 'starttls', 'ssl']
// Deliberately permissive: internal relays use hostnames a stricter pattern
// would reject. This only catches obvious typos and header-injection attempts.
const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const body = await readBody<Record<string, unknown>>(event)

  const patch: Partial<EmailSettings> = {}

  if (body.enabled !== undefined) patch.enabled = body.enabled === true
  if (body.allowInsecureTls !== undefined) patch.allowInsecureTls = body.allowInsecureTls === true

  for (const field of ['host', 'username', 'password', 'fromName', 'fromAddress', 'replyTo'] as const) {
    const v = body[field]
    if (v === undefined) continue
    if (typeof v !== 'string') throw createError({ statusCode: 400, statusMessage: `"${field}" must be a string` })
    // CR/LF in any of these would let a value break out into extra SMTP
    // headers (header injection) when the message is assembled.
    if (/[\r\n]/.test(v)) throw createError({ statusCode: 400, statusMessage: `"${field}" cannot contain line breaks` })
    patch[field] = field === 'password' ? v : v.trim()
  }

  if (body.port !== undefined) {
    const port = Number(body.port)
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      throw createError({ statusCode: 400, statusMessage: 'Port must be between 1 and 65535' })
    }
    patch.port = Math.round(port)
  }

  if (body.encryption !== undefined) {
    if (!ENCRYPTIONS.includes(body.encryption as SmtpEncryption)) {
      throw createError({ statusCode: 400, statusMessage: 'Encryption must be none, starttls, or ssl' })
    }
    patch.encryption = body.encryption as SmtpEncryption
  }

  if (patch.fromAddress && !EMAIL_RE.test(patch.fromAddress)) {
    throw createError({ statusCode: 400, statusMessage: 'From address must be a valid email address' })
  }
  if (patch.replyTo && !EMAIL_RE.test(patch.replyTo)) {
    throw createError({ statusCode: 400, statusMessage: 'Reply-To must be a valid email address' })
  }
  // Enabling delivery without a host or sender would fail on every send, so
  // validate the MERGED result (the form may only be patching `enabled`)
  // rather than silently accepting a config that can never deliver.
  if (patch.enabled) {
    const merged = { ...(await getEmailSettings()), ...patch }
    if (!merged.host) throw createError({ statusCode: 400, statusMessage: 'An SMTP host is required to enable email delivery' })
    if (!merged.fromAddress) throw createError({ statusCode: 400, statusMessage: 'A From address is required to enable email delivery' })
  }

  const next = await saveEmailSettings(patch, user.username)
  await audit({
    actor: user.username,
    action: 'settings.email.update',
    target: 'email',
    detail: `${next.enabled ? 'enabled' : 'disabled'} · ${next.host}:${next.port} (${next.encryption})`
  })

  const { password, ...safe } = next
  return { ...safe, passwordSet: Boolean(password), overridden: true }
})
