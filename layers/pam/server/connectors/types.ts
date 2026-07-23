import type { PasswordPolicy } from '../utils/pamPassword'

/**
 * Connector SDK — the typed contract every credential/target connector
 * implements. Connectors perform the credential lifecycle actions against a
 * target: change (rotate), verify, reconcile, test connection, discover.
 *
 * In-process connectors (implemented here) run inside the Nuxt/worker process
 * and are limited to safe, dependency-available transports (the vault itself,
 * and PostgreSQL via the bundled pg driver). Connectors requiring SSH/WinRM/
 * proprietary drivers declare `runsInProcess: false` and are executed by the
 * out-of-process connector-runner (services/pam/connector-runner) under CPU/
 * memory/network/time limits; in this build those actions return a structured
 * "requires connector-runner" result rather than a fake success.
 */

export interface ConnectorCapabilities {
  change: boolean
  verify: boolean
  reconcile: boolean
  test: boolean
  discover: boolean
}

export interface ConnectorActionContext {
  /** Target address/host and port from the account. */
  address: string | null
  port: number | null
  username: string
  /** The account's current credential plaintext (for verify/reconcile/change auth). */
  currentCredential?: string | null
  /** The freshly generated credential to apply (change only). */
  newCredential?: string | null
  /** A privileged logon/reconcile account credential, if the platform uses one. */
  logonCredential?: string | null
  /** Merged platform + instance config (never contains secrets). */
  config: Record<string, unknown>
  /** Structured, secret-redacting logger. */
  log: (message: string) => void
}

export interface ConnectorResult {
  ok: boolean
  detail?: string
  /** Set when the action could not run in-process and needs the runner. */
  requiresRunner?: boolean
}

export interface CredentialConnector {
  key: string
  label: string
  /** Target family this connector serves (matches platform.base_type). */
  baseType: string
  capabilities: ConnectorCapabilities
  runsInProcess: boolean
  /** Default password policy for generated credentials on this platform. */
  passwordPolicy?: PasswordPolicy
  /** JSON-schema-ish description of accepted config (for the UI + validation). */
  configSchema?: Record<string, unknown>
  version?: string
  change?(ctx: ConnectorActionContext): Promise<ConnectorResult>
  verify?(ctx: ConnectorActionContext): Promise<ConnectorResult>
  reconcile?(ctx: ConnectorActionContext): Promise<ConnectorResult>
  test?(ctx: ConnectorActionContext): Promise<ConnectorResult>
  discover?(ctx: ConnectorActionContext): Promise<{ ok: boolean; accounts: Array<Record<string, unknown>>; detail?: string }>
}

/** Standard result for actions that must run in the out-of-process runner. */
export function requiresRunner(action: string, baseType: string): ConnectorResult {
  return {
    ok: false,
    requiresRunner: true,
    detail: `The "${action}" action for ${baseType} targets runs in the out-of-process PAM connector-runner (services/pam/connector-runner), which is not attached in this deployment. The credential change was NOT applied to the target.`
  }
}
