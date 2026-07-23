import { randomInt } from 'node:crypto'

/**
 * Password generation and policy validation for managed credentials. Pure and
 * dependency-free (crypto.randomInt for unbiased selection) so it is fully
 * unit-tested and reused by every connector's change procedure.
 */

export interface PasswordPolicy {
  length?: number
  uppercase?: boolean
  lowercase?: boolean
  numbers?: boolean
  symbols?: boolean
  minCategories?: number
  allowedChars?: string
  forbiddenChars?: string
  prefix?: string
  suffix?: string
  minLength?: number
  maxLength?: number
  excludeUsername?: boolean
  excludeAmbiguous?: boolean
  dictionary?: string[]
  regex?: string
}

const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const LOWER = 'abcdefghijklmnopqrstuvwxyz'
const DIGITS = '0123456789'
const SYMBOLS = '!#$%&*+-=?@^_'
const AMBIGUOUS = new Set(['O', '0', 'l', '1', 'I', '|'])

export const DEFAULT_PASSWORD_POLICY: Required<Pick<PasswordPolicy, 'length' | 'uppercase' | 'lowercase' | 'numbers' | 'symbols' | 'minCategories'>> = {
  length: 24,
  uppercase: true,
  lowercase: true,
  numbers: true,
  symbols: true,
  minCategories: 3
}

function buildCategories(policy: PasswordPolicy): string[] {
  const forbidden = new Set((policy.forbiddenChars || '').split(''))
  const ambiguous = policy.excludeAmbiguous ? AMBIGUOUS : new Set<string>()
  const filter = (set: string) => set.split('').filter((c) => !forbidden.has(c) && !ambiguous.has(c)).join('')

  if (policy.allowedChars) {
    const allowed = filter(policy.allowedChars)
    return allowed ? [allowed] : []
  }
  const cats: string[] = []
  if (policy.uppercase !== false) cats.push(filter(UPPER))
  if (policy.lowercase !== false) cats.push(filter(LOWER))
  if (policy.numbers !== false) cats.push(filter(DIGITS))
  if (policy.symbols !== false) cats.push(filter(SYMBOLS))
  return cats.filter(Boolean)
}

/** Unbiased random pick from a string using crypto.randomInt. */
function pick(pool: string): string {
  return pool[randomInt(pool.length)]!
}

/**
 * Generate a password satisfying the policy. Guarantees at least one char from
 * each required category (up to minCategories), then fills to length, then
 * shuffles. Retries against dictionary/username/regex constraints.
 */
export function generatePassword(policy: PasswordPolicy = {}, username?: string): string {
  const length = Math.max(policy.length ?? DEFAULT_PASSWORD_POLICY.length, policy.minLength ?? 8)
  const cats = buildCategories(policy)
  if (!cats.length) throw new Error('Password policy allows no characters')
  const pool = cats.join('')

  for (let attempt = 0; attempt < 200; attempt++) {
    const chars: string[] = []
    // Seed one from each category to satisfy composition requirements.
    const required = Math.min(policy.minCategories ?? cats.length, cats.length)
    for (let i = 0; i < required && chars.length < length; i++) chars.push(pick(cats[i]!))
    while (chars.length < length) chars.push(pick(pool))
    // Fisher-Yates shuffle so seeded chars aren't positionally predictable.
    for (let i = chars.length - 1; i > 0; i--) {
      const j = randomInt(i + 1)
      ;[chars[i], chars[j]] = [chars[j]!, chars[i]!]
    }
    const body = chars.join('')
    const candidate = `${policy.prefix ?? ''}${body}${policy.suffix ?? ''}`
    if (validatePassword(candidate, policy, username).length === 0) return candidate
  }
  throw new Error('Could not generate a password satisfying the policy after 200 attempts')
}

/** Returns a list of human-readable violations ([] means valid). */
export function validatePassword(pw: string, policy: PasswordPolicy = {}, username?: string): string[] {
  const errors: string[] = []
  const min = policy.minLength ?? (policy.length ? Math.min(policy.length, policy.length) : 8)
  if (pw.length < min) errors.push(`must be at least ${min} characters`)
  if (policy.maxLength && pw.length > policy.maxLength) errors.push(`must be at most ${policy.maxLength} characters`)

  const body = pw
  if (policy.uppercase && !/[A-Z]/.test(body)) errors.push('missing uppercase letter')
  if (policy.lowercase && !/[a-z]/.test(body)) errors.push('missing lowercase letter')
  if (policy.numbers && !/[0-9]/.test(body)) errors.push('missing number')
  if (policy.symbols && !new RegExp(`[${SYMBOLS.replace(/[-\\^\]]/g, '\\$&')}]`).test(body)) errors.push('missing symbol')

  if (policy.minCategories) {
    const categories = [/[A-Z]/, /[a-z]/, /[0-9]/, new RegExp(`[${SYMBOLS.replace(/[-\\^\]]/g, '\\$&')}]`)]
    const present = categories.filter((re) => re.test(body)).length
    if (present < policy.minCategories) errors.push(`must include at least ${policy.minCategories} character categories`)
  }

  if (policy.forbiddenChars) {
    const forbidden = new Set(policy.forbiddenChars.split(''))
    if (pw.split('').some((c) => forbidden.has(c))) errors.push('contains a forbidden character')
  }
  if (policy.excludeUsername && username && pw.toLowerCase().includes(username.toLowerCase())) {
    errors.push('must not contain the username')
  }
  if (policy.dictionary?.some((w) => w && pw.toLowerCase().includes(w.toLowerCase()))) {
    errors.push('matches a dictionary-excluded word')
  }
  if (policy.regex) {
    try { if (!new RegExp(policy.regex).test(pw)) errors.push('does not match the required pattern') } catch { /* invalid regex ignored */ }
  }
  return errors
}
