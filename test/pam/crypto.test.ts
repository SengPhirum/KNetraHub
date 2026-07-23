import { describe, it, expect, beforeEach } from 'vitest'
import { seal, open, rewrap, keyFingerprint, activeKeyVersion, integritySignature, verifyIntegrity, _resetKeyring } from '../../layers/pam/server/utils/pamCrypto'

// The vault reads NUXT_PAM_MASTER_KEY from the environment at first use; set a
// deterministic keyring per test and reset the memoized keyring between them.
function setKeyring(json: string) {
  process.env.NUXT_PAM_MASTER_KEY = json
  _resetKeyring()
}

describe('PAM crypto vault (envelope encryption)', () => {
  beforeEach(() => setKeyring('secret-key-one'))

  it('seals and opens a value round-trip', () => {
    const sealed = seal('hunter2-super-secret')
    expect(sealed.valueCiphertext).not.toContain('hunter2')
    expect(sealed.wrappedDek).toBeTruthy()
    expect(open(sealed)).toBe('hunter2-super-secret')
  })

  it('produces a distinct DEK/ciphertext per seal (no reuse)', () => {
    const a = seal('same-value')
    const b = seal('same-value')
    expect(a.valueCiphertext).not.toBe(b.valueCiphertext)
    expect(a.wrappedDek).not.toBe(b.wrappedDek)
    expect(open(a)).toBe('same-value')
    expect(open(b)).toBe('same-value')
  })

  it('detects tampering via the GCM auth tag', () => {
    const sealed = seal('do-not-tamper')
    const [iv, tag, data] = sealed.valueCiphertext.split(':')
    const flipped = Buffer.from(data!, 'base64'); flipped[0] ^= 0xff
    const tampered = { ...sealed, valueCiphertext: `${iv}:${tag}:${flipped.toString('base64')}` }
    expect(() => open(tampered)).toThrow()
  })

  it('rewraps a DEK under a new master-key version without changing the value', () => {
    const sealed = seal('rotate-me')
    setKeyring(JSON.stringify({ active: 2, keys: { 1: 'secret-key-one', 2: 'secret-key-two' } }))
    expect(activeKeyVersion()).toBe(2)
    const rewrapped = rewrap(sealed) // unwrap with v1, rewrap with v2
    expect(rewrapped.keyVersion).toBe(2)
    expect(rewrapped.valueCiphertext).toBe(sealed.valueCiphertext) // ciphertext untouched
    expect(open(rewrapped)).toBe('rotate-me')
  })

  it('fails closed when the key version is unavailable', () => {
    const sealed = seal('orphaned')
    setKeyring('a-different-key') // only version 1 present, different material
    // The value was sealed under the old v1 material → unwrap fails (auth tag).
    expect(() => open(sealed)).toThrow()
  })

  it('key fingerprint is stable and non-reversible-looking', () => {
    const fp1 = keyFingerprint()
    setKeyring('secret-key-one')
    expect(keyFingerprint()).toBe(fp1)
    expect(fp1).not.toContain('secret-key-one')
  })

  it('integrity signatures verify and reject tampering', () => {
    const sig = integritySignature('recording-bytes-digest')
    expect(verifyIntegrity('recording-bytes-digest', sig)).toBe(true)
    expect(verifyIntegrity('recording-bytes-digest-modified', sig)).toBe(false)
  })
})
