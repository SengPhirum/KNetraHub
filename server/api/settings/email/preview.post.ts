import { requireRole } from '~~/server/utils/auth'
import { renderEmail } from '~~/server/utils/emailRender'
import { buildBaseContext } from '~~/server/utils/mailer'
import { DEFAULT_EMAIL_TEMPLATES, type EmailTemplateKey } from '~~/shared/utils/emailTemplates'

/**
 * Render an (unsaved) template draft against its sample context. Rendering
 * happens here rather than in the browser so the preview goes through exactly
 * the same code path as a real send - a Markdown quirk or an escaping rule
 * can never differ between what an admin previews and what a recipient gets.
 */
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin')
  const body = await readBody<Record<string, unknown>>(event)

  const key = String(body.key ?? '') as EmailTemplateKey
  const template = DEFAULT_EMAIL_TEMPLATES[key]
  if (!template) throw createError({ statusCode: 404, statusMessage: `Unknown email template "${key}"` })

  // Real app/now/year values win over the sample ones so the preview shows
  // this portal's actual branding - except the base URL, which falls back to
  // the sample when neither NUXT_PUBLIC_APP_URL nor a host is available, so
  // links never render as bare "/preferences/sessions".
  const base = await buildBaseContext(event)
  const baseApp = base.app as Record<string, unknown>
  const sampleApp = (template.sample.app ?? {}) as Record<string, unknown>
  const ctx = {
    ...template.sample,
    ...base,
    app: { ...sampleApp, ...baseApp, url: baseApp.url || sampleApp.url }
  }

  const rendered = renderEmail(
    {
      subject: String(body.subject ?? template.subject),
      format: body.format === 'html' ? 'html' : 'markdown',
      body: String(body.body ?? template.body)
    },
    ctx
  )

  return rendered
})
