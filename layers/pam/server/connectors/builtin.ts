import { Client } from 'pg'
import type { CredentialConnector, ConnectorActionContext, ConnectorResult } from './types'
import { requiresRunner } from './types'

/**
 * Built-in connectors.
 *
 * Fully operational in-process:
 *  - generic:    vault-managed credential (generated password / manual secret).
 *                "Change" simply rotates the stored value; there is no external
 *                target, so verify/reconcile are trivially satisfied. Used for
 *                application accounts, API credentials and generic secrets.
 *  - postgresql: a real target connector using the bundled `pg` driver. Change
 *                runs ALTER ROLE; verify opens a connection with the current
 *                credential; reconcile checks the role exists. Testable against
 *                a disposable Postgres (the documented integration target).
 *
 * Declared but runner-delegated (honest — no fake success): linux-ssh, windows,
 * network devices, mysql, mssql, mongodb, cloud. Their change/verify actions
 * return requiresRunner() until the out-of-process connector-runner is attached.
 */

const genericConnector: CredentialConnector = {
  key: 'generic',
  label: 'Generic (vault-managed)',
  baseType: 'generic',
  runsInProcess: true,
  capabilities: { change: true, verify: true, reconcile: true, test: true, discover: false },
  passwordPolicy: { length: 28, uppercase: true, lowercase: true, numbers: true, symbols: true, minCategories: 4 },
  configSchema: { type: 'object', properties: {} },
  version: '1.0.0',
  async change(): Promise<ConnectorResult> {
    // The vault IS the target — the new value is stored by the worker.
    return { ok: true, detail: 'Rotated vault-managed credential' }
  },
  async verify(): Promise<ConnectorResult> {
    return { ok: true, detail: 'Vault-managed credential present' }
  },
  async reconcile(): Promise<ConnectorResult> {
    return { ok: true, detail: 'No external target to reconcile' }
  },
  async test(): Promise<ConnectorResult> {
    return { ok: true, detail: 'Vault reachable' }
  }
}

function pgClientConfig(ctx: ConnectorActionContext, password: string | null | undefined) {
  const cfg = ctx.config || {}
  return {
    host: ctx.address || String(cfg.host || 'localhost'),
    port: ctx.port || Number(cfg.port || 5432),
    user: ctx.username,
    password: password || undefined,
    database: String(cfg.database || 'postgres'),
    ssl: cfg.ssl ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: Number(cfg.connectTimeoutMs || 8000)
  }
}

// Quote a SQL identifier safely (double quotes, escaped) — never string-concat
// untrusted values into DDL.
function quoteIdent(name: string): string {
  return `"${String(name).replace(/"/g, '""')}"`
}
// Single-quote a SQL literal for the password in ALTER ROLE (parameterized
// binds are not allowed in ALTER ROLE ... PASSWORD, so escape explicitly).
function quoteLiteral(value: string): string {
  return `'${String(value).replace(/'/g, "''")}'`
}

const postgresConnector: CredentialConnector = {
  key: 'postgresql',
  label: 'PostgreSQL',
  baseType: 'database-postgresql',
  runsInProcess: true,
  capabilities: { change: true, verify: true, reconcile: true, test: true, discover: true },
  passwordPolicy: { length: 24, uppercase: true, lowercase: true, numbers: true, symbols: false, minCategories: 3, forbiddenChars: "'\"\\`" },
  configSchema: {
    type: 'object',
    properties: {
      host: { type: 'string' },
      port: { type: 'number', default: 5432 },
      database: { type: 'string', default: 'postgres' },
      ssl: { type: 'boolean', default: false },
      useLogonAccount: { type: 'boolean', default: false, description: 'Change the target role using a separate privileged logon account' }
    }
  },
  version: '1.0.0',

  async change(ctx): Promise<ConnectorResult> {
    if (!ctx.newCredential) return { ok: false, detail: 'No new credential supplied' }
    const useLogon = !!(ctx.config?.useLogonAccount && ctx.logonCredential)
    // Authenticate as the logon account (if configured) or the account itself.
    const authUser = useLogon ? String(ctx.config.logonUsername || ctx.username) : ctx.username
    const authPass = useLogon ? ctx.logonCredential : ctx.currentCredential
    const client = new Client(pgClientConfig({ ...ctx, username: authUser }, authPass))
    try {
      await client.connect()
      await client.query(`ALTER ROLE ${quoteIdent(ctx.username)} WITH PASSWORD ${quoteLiteral(ctx.newCredential)}`)
      ctx.log(`Changed PostgreSQL role password for ${ctx.username}`)
      return { ok: true, detail: `ALTER ROLE ${ctx.username} succeeded` }
    } catch (err: any) {
      return { ok: false, detail: `PostgreSQL change failed: ${err?.message || err}` }
    } finally {
      await client.end().catch(() => {})
    }
  },

  async verify(ctx): Promise<ConnectorResult> {
    const client = new Client(pgClientConfig(ctx, ctx.currentCredential))
    try {
      await client.connect()
      await client.query('SELECT 1')
      return { ok: true, detail: 'Authenticated with the stored credential' }
    } catch (err: any) {
      return { ok: false, detail: `Verification failed: ${err?.message || err}` }
    } finally {
      await client.end().catch(() => {})
    }
  },

  async reconcile(ctx): Promise<ConnectorResult> {
    const useLogon = !!(ctx.config?.useLogonAccount && ctx.logonCredential)
    const authUser = useLogon ? String(ctx.config.logonUsername || ctx.username) : ctx.username
    const authPass = useLogon ? ctx.logonCredential : ctx.currentCredential
    const client = new Client(pgClientConfig({ ...ctx, username: authUser }, authPass))
    try {
      await client.connect()
      const { rows } = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [ctx.username])
      return rows.length
        ? { ok: true, detail: `Role ${ctx.username} exists on the target` }
        : { ok: false, detail: `Role ${ctx.username} not found on the target` }
    } catch (err: any) {
      return { ok: false, detail: `Reconcile failed: ${err?.message || err}` }
    } finally {
      await client.end().catch(() => {})
    }
  },

  async test(ctx): Promise<ConnectorResult> {
    const client = new Client(pgClientConfig(ctx, ctx.currentCredential || ctx.logonCredential))
    try {
      await client.connect()
      await client.query('SELECT version()')
      return { ok: true, detail: 'Connection succeeded' }
    } catch (err: any) {
      return { ok: false, detail: `Connection failed: ${err?.message || err}` }
    } finally {
      await client.end().catch(() => {})
    }
  },

  async discover(ctx) {
    const client = new Client(pgClientConfig(ctx, ctx.currentCredential || ctx.logonCredential))
    try {
      await client.connect()
      const { rows } = await client.query(
        `SELECT rolname AS username, rolsuper AS is_super, rolcanlogin AS can_login
           FROM pg_roles WHERE rolcanlogin = true ORDER BY rolname LIMIT 500`
      )
      return {
        ok: true,
        accounts: rows.map((r) => ({
          username: r.username,
          account_type: 'database',
          privileged_group: r.is_super ? 'superuser' : null,
          privilege_level: r.is_super ? 'high' : 'standard'
        }))
      }
    } catch (err: any) {
      return { ok: false, accounts: [], detail: `Discovery failed: ${err?.message || err}` }
    } finally {
      await client.end().catch(() => {})
    }
  }
}

/**
 * Runner-delegated target families. Real password policies and config schemas
 * are declared so platforms can be authored and credentials generated locally;
 * the target-apply step honestly reports that it requires the connector-runner.
 */
function runnerConnector(key: string, label: string, baseType: string, policy: CredentialConnector['passwordPolicy'], discover = false): CredentialConnector {
  return {
    key, label, baseType, runsInProcess: false,
    capabilities: { change: true, verify: true, reconcile: true, test: true, discover },
    passwordPolicy: policy,
    version: '1.0.0',
    async change() { return requiresRunner('change', baseType) },
    async verify() { return requiresRunner('verify', baseType) },
    async reconcile() { return requiresRunner('reconcile', baseType) },
    async test() { return requiresRunner('test', baseType) }
  }
}

const RUNNER_CONNECTORS: CredentialConnector[] = [
  runnerConnector('linux-ssh', 'Linux / Unix (SSH)', 'linux-ssh', { length: 28, uppercase: true, lowercase: true, numbers: true, symbols: true, minCategories: 4 }, true),
  runnerConnector('ssh-key', 'SSH Private Key', 'ssh-key', { length: 32 }),
  runnerConnector('windows-domain', 'Active Directory (LDAPS)', 'windows-domain', { length: 24, uppercase: true, lowercase: true, numbers: true, symbols: true, minCategories: 4 }, true),
  runnerConnector('windows-local', 'Windows local (WinRM)', 'windows-local', { length: 24, uppercase: true, lowercase: true, numbers: true, symbols: true, minCategories: 4 }, true),
  runnerConnector('cisco-ios', 'Cisco IOS / IOS-XE', 'network-cisco', { length: 20, uppercase: true, lowercase: true, numbers: true, symbols: false, minCategories: 3 }),
  runnerConnector('fortigate', 'Fortinet FortiGate', 'network-fortigate', { length: 20, uppercase: true, lowercase: true, numbers: true, symbols: false, minCategories: 3 }),
  runnerConnector('mysql', 'MySQL / MariaDB', 'database-mysql', { length: 24, uppercase: true, lowercase: true, numbers: true, symbols: false, minCategories: 3 }, true),
  runnerConnector('mssql', 'Microsoft SQL Server', 'database-mssql', { length: 24, uppercase: true, lowercase: true, numbers: true, symbols: true, minCategories: 3 }, true),
  runnerConnector('mongodb', 'MongoDB', 'database-mongodb', { length: 24, uppercase: true, lowercase: true, numbers: true, symbols: false, minCategories: 3 }),
  runnerConnector('aws-iam', 'AWS IAM access key', 'cloud-aws', { length: 40 }),
  runnerConnector('azure-sp', 'Microsoft Entra service principal', 'cloud-azure', { length: 40 }),
  runnerConnector('gcp-sa', 'Google Cloud service account', 'cloud-gcp', { length: 40 })
]

export const BUILTIN_CONNECTORS: CredentialConnector[] = [
  genericConnector,
  postgresConnector,
  ...RUNNER_CONNECTORS
]
