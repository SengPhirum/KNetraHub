import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool } from 'pg'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { migratePam } from '../../../layers/pam/server/db/migrate'
import { seedRunnerConnectorRegistry, connectorSigningKey } from '../../../layers/pam/server/utils/pamRunner'
import { verifyConnectorPackage } from '../../../layers/pam/server/utils/pamRunnerCore'

/**
 * Proves the connector publish→verify composition: the real bundle file digest
 * (from scripts/pam-publish-connectors.mjs) is registered + signed, and the
 * SAME verification gate the runner uses accepts the real bundle and rejects a
 * tampered one. Closes the loop between the (unit-tested) gate and the
 * (integration-tested) connector logic.
 */
const DSN = process.env.PAM_TEST_DATABASE_URL || 'postgres://pam:pam@localhost:55432/pam_test'
const CONNECTORS = join(process.cwd(), 'services', 'pam', 'connector-runner', 'connectors')
const MANIFEST = join(CONNECTORS, 'manifest.json')
let pool: Pool

beforeAll(async () => {
  pool = new Pool({ connectionString: DSN, max: 4 })
  await pool.query('SELECT 1')
  await pool.query('DROP SCHEMA IF EXISTS pam CASCADE')
  await migratePam(pool)
  process.env.PAM_CONNECTOR_MANIFEST = MANIFEST
  await seedRunnerConnectorRegistry(pool)
}, 120000)

afterAll(async () => { await pool?.end().catch(() => {}) })

describe('connector publish → registry → runner verification gate', () => {
  it('registers the REAL bundle file digest, and the runner gate accepts it / rejects tampering', async () => {
    const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Array<{ key: string; version: string; sha256: string; entry: string }>
    expect(manifest.length).toBeGreaterThanOrEqual(4)

    for (const m of manifest) {
      // 1. The manifest digest equals the actual bundle file's sha256.
      const fileDigest = createHash('sha256').update(readFileSync(join(CONNECTORS, m.entry))).digest('hex')
      expect(fileDigest).toBe(m.sha256)

      // 2. The registry row carries that real digest and a signature.
      const row = (await pool.query('SELECT * FROM pam.connectors WHERE connector_key=$1', [m.key])).rows[0]
      expect(row).toBeTruthy()
      expect(row.sha256).toBe(m.sha256)
      expect(row.signature).toBeTruthy()

      const entry = {
        connector_key: row.connector_key, version: row.version, sha256: row.sha256, signature: row.signature,
        enabled: row.enabled, trusted: row.trusted, activation_status: row.activation_status, compatibility: row.compatibility
      }
      // 3. The runner's verification gate ACCEPTS the real local bundle digest…
      expect(verifyConnectorPackage({ key: m.key, version: m.version, sha256: fileDigest }, entry, connectorSigningKey()).ok).toBe(true)
      // …and REJECTS a tampered bundle.
      expect(verifyConnectorPackage({ key: m.key, version: m.version, sha256: 'e'.repeat(64) }, entry, connectorSigningKey()).errorCode).toBe('digest_mismatch')
    }
  })

  it('includes the real locally-tested connectors', async () => {
    const keys = (await pool.query('SELECT connector_key FROM pam.connectors')).rows.map((r) => r.connector_key)
    for (const k of ['linux-ssh', 'ad-ldap', 'mysql', 'mongodb']) expect(keys).toContain(k)
  })
})
