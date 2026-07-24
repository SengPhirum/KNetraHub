import { describe, it, expect } from 'vitest'
import {
  generateRunnerToken, hashRunnerToken, runnerTokenMatches, parseBearer,
  signConnector, verifyConnectorSignature, isSafeConnectorRef, verifyConnectorPackage,
  applyReportDecision, redactLog, type ConnectorRegistryEntry
} from '../../layers/pam/server/utils/pamRunnerCore'

const SIGNING_KEY = 'test-connector-signing-key'

function entry(over: Partial<ConnectorRegistryEntry> = {}): ConnectorRegistryEntry {
  const base = { connector_key: 'linux-ssh', version: '1.0.0', sha256: 'a'.repeat(64) }
  // Registry signatures are over the (key, version, digest) tuple.
  const signature = signConnector({ key: base.connector_key, version: base.version, sha256: base.sha256 }, SIGNING_KEY)
  return {
    ...base,
    signature,
    enabled: true,
    trusted: true,
    activation_status: 'active',
    compatibility: null,
    kind: 'builtin',
    ...over
  }
}

describe('PAM runner — identity tokens', () => {
  it('mints a token whose hash matches and prefix is non-sensitive', () => {
    const t = generateRunnerToken()
    expect(t.token.startsWith('rnr_')).toBe(true)
    expect(t.tokenHash).toBe(hashRunnerToken(t.token))
    expect(t.tokenHash).not.toContain(t.token)
    expect(t.token.startsWith(t.tokenPrefix)).toBe(true)
  })

  it('constant-time token match accepts the right token and rejects others', () => {
    const t = generateRunnerToken()
    expect(runnerTokenMatches(t.token, t.tokenHash)).toBe(true)
    expect(runnerTokenMatches('rnr_wrong', t.tokenHash)).toBe(false)
    expect(runnerTokenMatches(t.token, 'not-a-hash')).toBe(false)
  })

  it('parses bearer tokens and ignores malformed headers', () => {
    expect(parseBearer('Bearer abc123')).toBe('abc123')
    expect(parseBearer('bearer   xyz ')).toBe('xyz')
    expect(parseBearer('Basic abc')).toBeNull()
    expect(parseBearer(null)).toBeNull()
  })
})

describe('PAM runner — connector signature', () => {
  it('signs and verifies an immutable (key,version,digest) tuple', () => {
    const ref = { key: 'linux-ssh', version: '1.0.0', sha256: 'deadbeef' }
    const sig = signConnector(ref, SIGNING_KEY)
    expect(verifyConnectorSignature(ref, sig, SIGNING_KEY)).toBe(true)
    expect(verifyConnectorSignature({ ...ref, sha256: 'tampered' }, sig, SIGNING_KEY)).toBe(false)
    expect(verifyConnectorSignature(ref, sig, 'other-key')).toBe(false)
  })
})

describe('PAM runner — safe connector refs (path-traversal defence)', () => {
  it('accepts normal keys/versions', () => {
    expect(isSafeConnectorRef('linux-ssh', '1.0.0')).toBe(true)
    expect(isSafeConnectorRef('aws-iam', '2.3.1-beta')).toBe(true)
  })
  it('rejects traversal, separators and absolute paths', () => {
    expect(isSafeConnectorRef('../etc/passwd', '1.0.0')).toBe(false)
    expect(isSafeConnectorRef('linux-ssh', '../../x')).toBe(false)
    expect(isSafeConnectorRef('a/b', '1.0.0')).toBe(false)
    expect(isSafeConnectorRef('/abs', '1.0.0')).toBe(false)
    expect(isSafeConnectorRef('a..b', '1.0.0')).toBe(false)
    expect(isSafeConnectorRef('', '1.0.0')).toBe(false)
  })
})

describe('PAM runner — connector package verification gate', () => {
  const good = { key: 'linux-ssh', version: '1.0.0', sha256: 'a'.repeat(64) }

  it('verifies a correctly registered, signed, digest-matched package', () => {
    const r = verifyConnectorPackage(good, entry(), SIGNING_KEY)
    expect(r.ok).toBe(true)
  })

  it('rejects unsafe refs before any lookup', () => {
    expect(verifyConnectorPackage({ ...good, key: '../x' }, entry(), SIGNING_KEY).errorCode).toBe('unsafe_ref')
  })
  it('rejects unregistered connectors', () => {
    expect(verifyConnectorPackage(good, null, SIGNING_KEY).errorCode).toBe('not_registered')
  })
  it('rejects disabled / untrusted / inactive', () => {
    expect(verifyConnectorPackage(good, entry({ enabled: false }), SIGNING_KEY).errorCode).toBe('disabled')
    expect(verifyConnectorPackage(good, entry({ trusted: false }), SIGNING_KEY).errorCode).toBe('untrusted')
    expect(verifyConnectorPackage(good, entry({ activation_status: 'rolled_back' }), SIGNING_KEY).errorCode).toBe('not_active')
  })
  it('rejects version drift unless whitelisted in compatibility', () => {
    expect(verifyConnectorPackage({ ...good, version: '2.0.0' }, entry(), SIGNING_KEY).errorCode).toBe('version_mismatch')
    // A registry entry that declares compatibility accepts the offered version,
    // but the signature is over the registry (entry) version, so re-sign for it.
    const compatEntry = entry({ compatibility: '2.0.0' })
    expect(verifyConnectorPackage({ ...good, version: '2.0.0' }, compatEntry, SIGNING_KEY).ok).toBe(true)
  })
  it('rejects digest mismatch (tampered local bundle)', () => {
    expect(verifyConnectorPackage({ ...good, sha256: 'b'.repeat(64) }, entry(), SIGNING_KEY).errorCode).toBe('digest_mismatch')
  })
  it('rejects unsigned and badly-signed entries', () => {
    expect(verifyConnectorPackage(good, entry({ signature: null }), SIGNING_KEY).errorCode).toBe('unsigned')
    expect(verifyConnectorPackage(good, entry({ signature: 'deadbeef' }), SIGNING_KEY).errorCode).toBe('bad_signature')
    // A signature valid under a different key must not verify under ours.
    const foreign = entry({ signature: signConnector({ key: 'linux-ssh', version: '1.0.0', sha256: 'a'.repeat(64) }, 'attacker-key') })
    expect(verifyConnectorPackage(good, foreign, SIGNING_KEY).errorCode).toBe('bad_signature')
  })
})

describe('PAM runner — report application decision', () => {
  it('seals a change only when target changed AND verified', () => {
    const d = applyReportDecision({ job_type: 'rotate' }, { ok: true, targetChanged: true, verified: true })
    expect(d).toMatchObject({ seal: true, ok: true, terminal: false })
  })
  it('does NOT seal a change that is ok but unverified', () => {
    const d = applyReportDecision({ job_type: 'rotate' }, { ok: true, targetChanged: true, verified: false })
    expect(d.seal).toBe(false)
    expect(d.ok).toBe(false)
  })
  it('does NOT seal a change that is ok but not applied to target', () => {
    const d = applyReportDecision({ job_type: 'change' }, { ok: true, targetChanged: false, verified: true })
    expect(d.seal).toBe(false)
    expect(d.ok).toBe(false)
  })
  it('never seals for non-change actions', () => {
    expect(applyReportDecision({ job_type: 'verify' }, { ok: true }).seal).toBe(false)
    expect(applyReportDecision({ job_type: 'verify' }, { ok: true }).ok).toBe(true)
  })
  it('classifies retryable vs terminal failures', () => {
    expect(applyReportDecision({ job_type: 'rotate' }, { ok: false, retryable: true }).terminal).toBe(false)
    expect(applyReportDecision({ job_type: 'rotate' }, { ok: false, retryable: false }).terminal).toBe(true)
  })
})

describe('PAM runner — log redaction', () => {
  it('redacts secret-looking tokens', () => {
    const out = redactLog('connected with password Sup3rSecretPasswordThatIsVeryLong12345')
    expect(out).not.toContain('Sup3rSecretPasswordThatIsVeryLong12345')
    expect(out).toContain('«redacted»')
  })
})
