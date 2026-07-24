import { describe, it, expect } from 'vitest'
import { resolveProtocol, isValidProtocol } from '../../layers/pam/server/utils/pamSessionCore'

describe('resolveProtocol (session-launch protocol bug)', () => {
  it('honours a valid explicit protocol — regression for the operator-precedence bug', () => {
    // The old `String(body.protocol || accountType==='database' ? 'db':'ssh')`
    // collapsed EVERY explicit protocol to 'db'. These must now pass through.
    expect(resolveProtocol('rdp', 'windows')).toBe('rdp')
    expect(resolveProtocol('vnc', 'linux')).toBe('vnc')
    expect(resolveProtocol('web', 'generic')).toBe('web')
    expect(resolveProtocol('ssh', 'database')).toBe('ssh') // explicit ssh not forced to db
  })

  it('defaults from the account type when no/invalid protocol is given', () => {
    expect(resolveProtocol(undefined, 'database')).toBe('db')
    expect(resolveProtocol('', 'database')).toBe('db')
    expect(resolveProtocol(undefined, 'linux')).toBe('ssh')
    expect(resolveProtocol('bogus', 'linux')).toBe('ssh')
    expect(resolveProtocol(null, null)).toBe('ssh')
  })

  it('is case- and whitespace-tolerant', () => {
    expect(resolveProtocol('  RDP ', 'x')).toBe('rdp')
    expect(isValidProtocol('ssh')).toBe(true)
    expect(isValidProtocol('telnet')).toBe(false)
  })
})
