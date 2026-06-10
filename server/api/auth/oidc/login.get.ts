import { oidcBeginLogin } from '~~/server/utils/oidc'

export default defineEventHandler(async (event) => {
  const url = await oidcBeginLogin(event)
  return sendRedirect(event, url, 302)
})
