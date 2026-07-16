import { describe, it, expect } from 'vitest'
import { parseSyslog } from '../../server/receivers/syslogParser'

describe('parseSyslog', () => {
  it('parses RFC 5424', () => {
    const raw = '<34>1 2026-07-16T12:00:00Z core-sw-01 sshd 1234 ID47 - accepted password for admin'
    const p = parseSyslog(raw)
    expect(p.rfc).toBe('5424')
    expect(p.facility).toBe(4)
    expect(p.severity).toBe(2)
    expect(p.hostname).toBe('core-sw-01')
    expect(p.appName).toBe('sshd')
    expect(p.procId).toBe('1234')
    expect(p.msgId).toBe('ID47')
    expect(p.message).toContain('accepted password')
  })

  it('parses RFC 3164', () => {
    const raw = '<189>Oct 11 22:14:15 core-sw-01 %LINK-3-UPDOWN: Interface Gi0/2, changed state to down'
    const p = parseSyslog(raw)
    expect(p.rfc).toBe('3164')
    expect(p.hostname).toBe('core-sw-01')
    expect(p.facility).toBe(23)
    expect(p.severity).toBe(5)
    expect(p.message).toContain('Gi0/2')
  })

  it('parses RFC 3164 with a tag[pid]: prefix', () => {
    const raw = '<38>Jan  1 00:00:01 db-01 sshd[4321]: Accepted publickey for root'
    const p = parseSyslog(raw)
    expect(p.appName).toBe('sshd')
    expect(p.procId).toBe('4321')
    expect(p.message).toContain('Accepted publickey')
  })

  it('falls back to raw for unparseable input without <pri>', () => {
    const p = parseSyslog('just some plain text with no priority header')
    expect(p.rfc).toBe('raw')
    expect(p.facility).toBeNull()
    expect(p.message).toContain('plain text')
  })

  it('parses a bare <pri>message with no structured fields', () => {
    const p = parseSyslog('<13>hello world')
    expect(p.rfc).toBe('raw')
    expect(p.facility).toBe(1)
    expect(p.severity).toBe(5)
    expect(p.message).toBe('hello world')
  })

  it('never throws on malformed/truncated input', () => {
    expect(() => parseSyslog('<999999999999999999999999>')).not.toThrow()
    expect(() => parseSyslog('')).not.toThrow()
    expect(() => parseSyslog('<>')).not.toThrow()
  })
})
