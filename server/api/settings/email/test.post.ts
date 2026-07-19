import { requireRole } from '~~/server/utils/auth'
import { getEmailSettings, getEmailTemplate } from '~~/server/utils/emailSettings'
import { sendMail, buildBaseContext } from '~~/server/utils/mailer'
import { renderEmail } from '~~/server/utils/emailRender'
import { audit } from '~~/server/utils/store'

/**
 * Send the "test" template to one address to prove the relay works.
 *
 * The posted settings (if any) are used INSTEAD of the stored ones, so an
 * admin can verify a host/password before committing it - a blank password in
 * the body falls back to the saved one, matching the form's behaviour.
 * Delivery is attempted even when `enabled` is off: you test first, then
 * switch it on.
 */
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const body = await readBody<Record<string, any>>(event)

  const to = String(body?.to ?? '').trim()
  if (!to) throw createError({ statusCode: 400, statusMessage: 'A recipient address is required' })
  if (/[\r\n]/.test(to)) throw createError({ statusCode: 400, statusMessage: 'Recipient cannot contain line breaks' })

  const stored = await getEmailSettings()
  const draft = body?.settings && typeof body.settings === 'object' ? body.settings : {}
  const settings = {
    ...stored,
    ...draft,
    // Never let an unsaved draft disable the very test being requested.
    enabled: true,
    port: Number(draft.port ?? stored.port),
    password: draft.password ? String(draft.password) : stored.password
  }

  if (!settings.host) throw createError({ statusCode: 400, statusMessage: 'An SMTP host is required' })
  if (!settings.fromAddress) throw createError({ statusCode: 400, statusMessage: 'A From address is required' })

  const [template, ctx] = await Promise.all([getEmailTemplate('test'), buildBaseContext(event)])
  const rendered = renderEmail(template, {
    ...ctx,
    actor: user.username,
    smtp: { host: settings.host, port: settings.port, encryption: settings.encryption }
  })

  const result = await sendMail({
    to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    settings
  })

  await audit({
    actor: user.username,
    action: 'settings.email.test',
    target: result.target,
    detail: result.ok ? 'delivered' : `failed: ${result.error}`
  })

  return result
})
