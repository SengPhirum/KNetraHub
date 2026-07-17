import { describe, it, expect } from 'vitest'
import { buildInlineSnmpConfig } from '../../server/snmp/inlineConfig'

const defaults = { timeoutMs: 3000, retries: 2 }

describe('buildInlineSnmpConfig', () => {
  it('builds a v2c config with sensible fallbacks', () => {
    const cfg = buildInlineSnmpConfig({ host: '10.0.0.1' }, null, defaults)
    expect(cfg).toMatchObject({ host: '10.0.0.1', port: 161, transport: 'udp4', version: 'v2c', community: 'public' })
    expect(cfg.context).toBeUndefined()
  })

  it('selects udp6 for IPv6 hosts', () => {
    const cfg = buildInlineSnmpConfig({ host: 'fd00::1' }, null, defaults)
    expect(cfg.transport).toBe('udp6')
  })

  it('inline values win over profile values', () => {
    const cfg = buildInlineSnmpConfig(
      { host: 'h', community: 'inline', port: 1161 },
      { community: 'profile', port: 161, version: 'v1' },
      defaults
    )
    expect(cfg.version).toBe('v1') // only profile provided a version
    expect(cfg.community).toBe('inline')
    expect(cfg.port).toBe(1161)
  })

  it('builds v3 credentials with profile fallback', () => {
    const cfg = buildInlineSnmpConfig(
      { host: 'h', version: 'v3', v3_username: 'monitor' },
      { v3_level: 'authNoPriv', v3_auth_protocol: 'sha256', v3_auth_password: 'secret' },
      defaults
    )
    expect(cfg.v3).toMatchObject({ level: 'authNoPriv', username: 'monitor', authProtocol: 'sha256', authPassword: 'secret' })
    expect(cfg.community).toBeUndefined()
  })
})
