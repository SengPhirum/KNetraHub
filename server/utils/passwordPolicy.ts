import { passwordPolicyErrors } from '../../shared/utils/passwordPolicy'
import { getLocalAuthSettings } from './authSettings'

export async function enforcePasswordPolicy(password: string): Promise<void> {
  const policy = await getLocalAuthSettings()
  const errors = passwordPolicyErrors(password, policy)
  if (errors.length) {
    throw createError({ statusCode: 400, statusMessage: errors.join('. ') })
  }
}
