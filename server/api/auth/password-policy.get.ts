import { getLocalAuthSettings } from '~~/server/utils/authSettings'

/** Public policy metadata used by first-run and password forms. */
export default defineEventHandler(async () => {
  const local = await getLocalAuthSettings()
  return {
    passwordMinLength: local.passwordMinLength,
    passwordRequireUppercase: local.passwordRequireUppercase,
    passwordRequireLowercase: local.passwordRequireLowercase,
    passwordRequireNumber: local.passwordRequireNumber,
    passwordRequireSpecial: local.passwordRequireSpecial
  }
})
