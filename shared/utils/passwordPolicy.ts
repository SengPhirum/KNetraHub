export interface PasswordPolicy {
  passwordMinLength: number
  passwordRequireUppercase: boolean
  passwordRequireLowercase: boolean
  passwordRequireNumber: boolean
  passwordRequireSpecial: boolean
}

export function passwordPolicyErrors(password: string, policy: PasswordPolicy): string[] {
  const errors: string[] = []
  if (password.length < policy.passwordMinLength) {
    errors.push(`Password must be at least ${policy.passwordMinLength} characters`)
  }
  if (policy.passwordRequireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must include an uppercase letter')
  }
  if (policy.passwordRequireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must include a lowercase letter')
  }
  if (policy.passwordRequireNumber && !/[0-9]/.test(password)) {
    errors.push('Password must include a number')
  }
  if (policy.passwordRequireSpecial && !/[^A-Za-z0-9]/.test(password)) {
    errors.push('Password must include a special character')
  }
  return errors
}

export function passwordPolicySummary(policy: PasswordPolicy): string {
  const requirements = [`at least ${policy.passwordMinLength} characters`]
  if (policy.passwordRequireUppercase) requirements.push('an uppercase letter')
  if (policy.passwordRequireLowercase) requirements.push('a lowercase letter')
  if (policy.passwordRequireNumber) requirements.push('a number')
  if (policy.passwordRequireSpecial) requirements.push('a special character')
  return `Use ${requirements.join(', ')}`
}
