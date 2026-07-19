import { requireRole } from '~~/server/utils/auth'
import { listEmailTemplates } from '~~/server/utils/emailSettings'
import { COMMON_EMAIL_VARIABLES } from '~~/shared/utils/emailTemplates'

/** The full catalog, each entry merged with its stored override. */
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin')
  return {
    templates: await listEmailTemplates(),
    commonVariables: COMMON_EMAIL_VARIABLES
  }
})
