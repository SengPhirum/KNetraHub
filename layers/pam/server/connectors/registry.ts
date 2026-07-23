import type { CredentialConnector } from './types'
import { BUILTIN_CONNECTORS } from './builtin'

/**
 * Connector registry. Built-in connectors are trusted and always present;
 * custom connectors are executed only in the out-of-process runner and must be
 * on the signed/trusted allowlist (pam.connectors.trusted) before use.
 */
const byKey = new Map<string, CredentialConnector>()
const byBaseType = new Map<string, CredentialConnector>()

for (const c of BUILTIN_CONNECTORS) {
  byKey.set(c.key, c)
  byBaseType.set(c.baseType, c)
}

export function getConnector(key: string): CredentialConnector | null {
  return byKey.get(key) ?? null
}

/** Resolve the connector for a platform: explicit connector_key, else base_type. */
export function connectorForPlatform(platform: { connector_key?: string | null; base_type?: string | null } | null): CredentialConnector | null {
  if (!platform) return getConnector('generic')
  if (platform.connector_key && byKey.has(platform.connector_key)) return byKey.get(platform.connector_key)!
  if (platform.base_type && byBaseType.has(platform.base_type)) return byBaseType.get(platform.base_type)!
  return getConnector('generic')
}

export function listConnectors(): CredentialConnector[] {
  return [...byKey.values()]
}

/** Public, secret-free descriptor for the connectors admin UI / API. */
export function connectorDescriptor(c: CredentialConnector) {
  return {
    key: c.key,
    label: c.label,
    baseType: c.baseType,
    runsInProcess: c.runsInProcess,
    capabilities: c.capabilities,
    version: c.version ?? '1.0.0',
    configSchema: c.configSchema ?? { type: 'object', properties: {} },
    passwordPolicy: c.passwordPolicy ?? null
  }
}
