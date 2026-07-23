# KNetraHub PAM — Connector Development Guide

A connector implements the credential lifecycle against a target system:
`change` (rotate), `verify`, `reconcile`, `test`, and `discover`. The typed
contract is [`layers/pam/server/connectors/types.ts`](../../layers/pam/server/connectors/types.ts);
the reference implementation is [`example.ts`](../../layers/pam/server/connectors/example.ts).

## Interface

```ts
interface CredentialConnector {
  key: string
  label: string
  baseType: string                 // matches platform.base_type
  capabilities: { change; verify; reconcile; test; discover }
  runsInProcess: boolean           // custom connectors MUST be false
  passwordPolicy?: PasswordPolicy  // default policy for generated credentials
  configSchema?: object            // JSON-schema-ish; drives the UI + validation
  version?: string
  change?(ctx): Promise<{ ok; detail?; requiresRunner? }>
  verify?(ctx): Promise<{ ok; detail? }>
  reconcile?(ctx): Promise<{ ok; detail? }>
  test?(ctx): Promise<{ ok; detail? }>
  discover?(ctx): Promise<{ ok; accounts; detail? }>
}
```

`ctx` carries `address`, `port`, `username`, `currentCredential`,
`newCredential` (change only), `logonCredential`, merged `config` (no secrets),
and a secret-redacting `log()`.

## Rules

1. **Never string-concatenate untrusted input into a command.** Use structured
   arguments / parameter binding / identifier escaping. The built-in PostgreSQL
   connector escapes the role identifier and password literal explicitly because
   `ALTER ROLE … PASSWORD` cannot use a bind parameter.
2. **Never log secrets.** `ctx.log()` output is retained; the runner also redacts.
3. **Return `{ ok: false, detail }`** for expected target errors; do not throw.
4. **Respect timeouts** from `ctx.config`.
5. **Custom connectors declare `runsInProcess: false`** and run in the
   connector-runner sandbox (worker thread, memory cap, wall-clock timeout, no
   Docker socket, read-only rootfs, dropped capabilities).
6. **Trust:** custom bundles must be on the signed/trusted allowlist
   (`pam.connectors.trusted`) before the runner will load them.

## Built-in connectors

| Key | Base type | In-process | Notes |
|---|---|---|---|
| `generic` | `generic` | ✅ | Vault-managed; change rotates the stored value |
| `postgresql` | `database-postgresql` | ✅ | Real `ALTER ROLE`, verify by connect, reconcile by `pg_roles`, discover logins |
| `linux-ssh`, `windows-*`, `cisco-ios`, `fortigate`, `mysql`, `mssql`, `mongodb`, `aws-iam`, `azure-sp`, `gcp-sa` | various | ⛔ runner | Password policy + config declared; target-apply returns `requiresRunner` until the runner is attached |

## Adding a built-in connector

1. Implement it in [`builtin.ts`](../../layers/pam/server/connectors/builtin.ts) and add it to `BUILTIN_CONNECTORS`.
2. It is auto-registered ([`registry.ts`](../../layers/pam/server/connectors/registry.ts)) and seeded into `pam.connectors` on next boot ([`pamSeed.ts`](../../layers/pam/server/utils/pamSeed.ts)).
3. Create a platform (`POST /api/pam/v1/platforms`) with `connector_key` set, assign accounts to it, and rotation/verify jobs will use it.

## Adding a custom (out-of-process) connector

1. Package a module whose `default` export is a `CredentialConnector` with `runsInProcess: false`.
2. Mount the bundle read-only into the `pam-connector-runner` container at `/connectors`.
3. Add its signed hash to the trusted allowlist. The runner loads it in a
   sandboxed worker and posts back `{ ok, detail }`.

## Test harness

The pure password policy the connector uses is unit-tested
([`test/pam/password.test.ts`](../../test/pam/password.test.ts)). For target
actions, use the documented disposable targets (a PostgreSQL container for the
`postgresql` connector; OpenSSH/MariaDB containers for runner connectors) and
assert on the `{ ok, detail }` result and the resulting `credential_versions`
row.
