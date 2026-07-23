import { describe, it, expect } from 'vitest'
import { generatePassword, validatePassword } from '../../layers/pam/server/utils/pamPassword'

describe('PAM password generation & policy', () => {
  it('generates a password satisfying a strong default policy', () => {
    for (let i = 0; i < 50; i++) {
      const pw = generatePassword({ length: 24, uppercase: true, lowercase: true, numbers: true, symbols: true, minCategories: 4 })
      expect(pw.length).toBe(24)
      expect(validatePassword(pw, { length: 24, uppercase: true, lowercase: true, numbers: true, symbols: true, minCategories: 4 })).toEqual([])
    }
  })

  it('honours length and forbidden characters', () => {
    const pw = generatePassword({ length: 40, forbiddenChars: "'\"\\`", symbols: true })
    expect(pw.length).toBe(40)
    for (const c of "'\"\\`") expect(pw).not.toContain(c)
  })

  it('excludes the username when required', () => {
    const pw = generatePassword({ length: 20, excludeUsername: true }, 'admin')
    expect(pw.toLowerCase()).not.toContain('admin')
  })

  it('applies prefix and suffix', () => {
    const pw = generatePassword({ length: 16, prefix: 'PFX-', suffix: '-SFX' })
    expect(pw.startsWith('PFX-')).toBe(true)
    expect(pw.endsWith('-SFX')).toBe(true)
  })

  it('validatePassword reports each violation', () => {
    expect(validatePassword('short', { minLength: 12 })).toContain('must be at least 12 characters')
    expect(validatePassword('alllowercase123', { uppercase: true })).toContain('missing uppercase letter')
    expect(validatePassword('SecretP@ss1', { dictionary: ['secret'] })).toContain('matches a dictionary-excluded word')
  })

  it('respects a custom regex requirement', () => {
    expect(validatePassword('abcdefgh123', { regex: '^[a-z]+\\d+$' })).toEqual([])
    expect(validatePassword('ABCDEFGH123', { regex: '^[a-z]+\\d+$' })).toContain('does not match the required pattern')
  })
})
