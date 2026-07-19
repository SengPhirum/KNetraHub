import { requireRole } from '~~/server/utils/auth'
import { saveEmailTemplate } from '~~/server/utils/emailSettings'
import { audit } from '~~/server/utils/store'
import type { EmailTemplateKey } from '~~/shared/utils/emailTemplates'

const MAX_BODY_LENGTH = 50_000

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const key = getRouterParam(event, 'key') as EmailTemplateKey
  const body = await readBody<Record<string, unknown>>(event)

  const subject = String(body.subject ?? '').trim()
  const content = String(body.body ?? '')
  const format = body.format === 'html' ? 'html' : 'markdown'

  if (!subject) throw createError({ statusCode: 400, statusMessage: 'Subject cannot be empty' })
  // A subject is one header line - CR/LF would let it inject extra headers.
  if (/[\r\n]/.test(subject)) throw createError({ statusCode: 400, statusMessage: 'Subject cannot contain line breaks' })
  if (!content.trim()) throw createError({ statusCode: 400, statusMessage: 'Message body cannot be empty' })
  if (content.length > MAX_BODY_LENGTH) {
    throw createError({ statusCode: 400, statusMessage: `Message body cannot exceed ${MAX_BODY_LENGTH.toLocaleString()} characters` })
  }

  const saved = await saveEmailTemplate(key, { subject, format, body: content }, user.username)
  await audit({ actor: user.username, action: 'settings.email.template.update', target: key })
  return saved
})
