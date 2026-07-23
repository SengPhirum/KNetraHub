import type { CredentialConnector, ConnectorActionContext, ConnectorResult } from './types'

/**
 * Example connector — the reference implementation for the connector SDK.
 *
 * Copy this file, implement the action hooks against your target's API/CLI,
 * declare your capabilities and password policy, and register it (built-in:
 * add to builtin.ts; custom: package it for the out-of-process connector-runner
 * and add its signed hash to the trusted allowlist). Rules:
 *   - NEVER string-concatenate untrusted input into a command; use structured
 *     arguments / parameter binding / identifier escaping.
 *   - NEVER log secrets — ctx.log() output is retained.
 *   - Return { ok: false, detail } on failure; do not throw for expected
 *     target-side errors. Respect timeouts from ctx.config.
 *   - Custom connectors MUST declare runsInProcess: false.
 */
export const exampleConnector: CredentialConnector = {
  key: 'example-http',
  label: 'Example HTTP appliance',
  baseType: 'example',
  runsInProcess: false,
  version: '1.0.0',
  capabilities: { change: true, verify: true, reconcile: false, test: true, discover: false },
  passwordPolicy: { length: 24, uppercase: true, lowercase: true, numbers: true, symbols: true, minCategories: 3 },
  configSchema: {
    type: 'object',
    required: ['baseUrl'],
    properties: {
      baseUrl: { type: 'string', description: 'Appliance management API base URL' },
      verifyTls: { type: 'boolean', default: true },
      timeoutMs: { type: 'number', default: 8000 }
    }
  },

  async change(ctx: ConnectorActionContext): Promise<ConnectorResult> {
    if (!ctx.newCredential) return { ok: false, detail: 'No new credential supplied' }
    // Pseudocode (runs in the connector-runner sandbox):
    //   const res = await fetch(`${ctx.config.baseUrl}/api/users/${encodeURIComponent(ctx.username)}/password`, {
    //     method: 'POST',
    //     headers: { authorization: `Bearer ${ctx.currentCredential}` },
    //     body: JSON.stringify({ password: ctx.newCredential }),
    //     signal: AbortSignal.timeout(Number(ctx.config.timeoutMs ?? 8000))
    //   })
    //   return res.ok ? { ok: true } : { ok: false, detail: `HTTP ${res.status}` }
    ctx.log(`Would change credential for ${ctx.username} via ${String(ctx.config.baseUrl)}`)
    return { ok: false, requiresRunner: true, detail: 'Reference example — implement against your appliance API in the connector-runner' }
  },

  async verify(ctx: ConnectorActionContext): Promise<ConnectorResult> {
    ctx.log(`Would verify ${ctx.username}`)
    return { ok: false, requiresRunner: true, detail: 'Reference example' }
  },

  async test(ctx: ConnectorActionContext): Promise<ConnectorResult> {
    ctx.log('Would test connectivity')
    return { ok: false, requiresRunner: true, detail: 'Reference example' }
  }
}
