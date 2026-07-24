/**
 * Pure session-launch helpers (no DB/Nuxt imports) so they are unit-testable.
 */

const VALID_PROTOCOLS = new Set(['ssh', 'rdp', 'vnc', 'db', 'web'])

/**
 * Resolve the session protocol. Fixes the operator-precedence bug where
 *   String(body.protocol || accountType === 'database' ? 'db' : 'ssh')
 * collapsed every explicit protocol to 'db'. An explicit, valid protocol wins;
 * otherwise default from the account type.
 */
export function resolveProtocol(bodyProtocol: unknown, accountType: string | null | undefined): string {
  const p = typeof bodyProtocol === 'string' ? bodyProtocol.trim().toLowerCase() : ''
  if (VALID_PROTOCOLS.has(p)) return p
  return accountType === 'database' ? 'db' : 'ssh'
}

export function isValidProtocol(p: string): boolean {
  return VALID_PROTOCOLS.has(p)
}
