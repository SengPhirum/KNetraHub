import type { Pool } from 'pg'
import { getPamDb } from '~~/server/utils/moduleDb'
import { activeKeyVersion, keyFingerprint } from './pamCrypto'
import { BUILTIN_CONNECTORS } from '../connectors/builtin'
import { DEFAULT_RISK_RULES } from './pamRisk'
import { newId, nowIso } from './pamStore'

/**
 * Idempotent seed run at PAM bootstrap (after migrations). Registers the active
 * master-key version + fingerprint (detects a wrong/rotated key), the built-in
 * connectors, default risk rules, starter platforms, a default SSH gateway
 * record, and default settings. Safe to run repeatedly.
 */
export async function seedPam(db: Pool = getPamDb()): Promise<void> {
  await seedCryptoKey(db)
  await seedConnectors(db)
  await seedRiskRules(db)
  await seedPlatforms(db)
  await seedGateway(db)
  await seedSettings(db)
}

async function seedCryptoKey(db: Pool): Promise<void> {
  const version = activeKeyVersion()
  const fp = keyFingerprint(version)
  const { rows } = await db.query('SELECT fingerprint, state FROM pam.crypto_keys WHERE version = $1', [version])
  if (!rows.length) {
    await db.query(
      `INSERT INTO pam.crypto_keys (id, version, algo, purpose, state, fingerprint, created_at, activated_at, created_by)
       VALUES ($1,$2,'aes-256-gcm','master','active',$3,$4,$4,'system')
       ON CONFLICT (version) DO NOTHING`,
      [newId(), version, fp, nowIso()]
    )
  } else if (rows[0].fingerprint !== fp) {
    // The configured master key changed for an existing version — this is a
    // misconfiguration (values sealed under the old key can no longer be
    // unwrapped). Surface loudly rather than silently corrupting the vault.
    console.error(`[pam:seed] MASTER KEY MISMATCH for version ${version}: configured key does not match the fingerprint on record. Existing credentials will FAIL to decrypt. Restore the correct key or rotate to a new version.`)
  }
}

async function seedConnectors(db: Pool): Promise<void> {
  for (const c of BUILTIN_CONNECTORS) {
    await db.query(
      `INSERT INTO pam.connectors (id, connector_key, name, kind, version, config_schema, capabilities, trusted, enabled, created_at)
       VALUES ($1,$2,$3,'builtin',$4,$5,$6,true,true,$7)
       ON CONFLICT (connector_key) DO UPDATE SET
         name = EXCLUDED.name, version = EXCLUDED.version,
         config_schema = EXCLUDED.config_schema, capabilities = EXCLUDED.capabilities, updated_at = $7`,
      [newId(), c.key, c.label, c.version ?? '1.0.0', JSON.stringify(c.configSchema ?? {}), JSON.stringify(c.capabilities), nowIso()]
    )
  }
}

async function seedRiskRules(db: Pool): Promise<void> {
  for (const r of DEFAULT_RISK_RULES) {
    await db.query(
      `INSERT INTO pam.risk_rules (id, rule_key, name, description, severity, enabled, auto_response, created_at)
       VALUES ($1,$2,$3,$4,$5,true,$6,$7)
       ON CONFLICT (rule_key) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description`,
      [newId(), r.key, r.name, r.description, r.severity, JSON.stringify(r.defaultAutoResponse ?? []), nowIso()]
    )
  }
}

interface SeedPlatform {
  slug: string; name: string; baseType: string; connectorKey: string
}
const STARTER_PLATFORMS: SeedPlatform[] = [
  { slug: 'generic', name: 'Generic (vault-managed)', baseType: 'generic', connectorKey: 'generic' },
  { slug: 'linux-ssh', name: 'Linux / Unix (SSH)', baseType: 'linux-ssh', connectorKey: 'linux-ssh' },
  { slug: 'windows-domain', name: 'Windows Domain (Active Directory)', baseType: 'windows-domain', connectorKey: 'windows-domain' },
  { slug: 'postgresql', name: 'PostgreSQL Database', baseType: 'database-postgresql', connectorKey: 'postgresql' }
]

async function seedPlatforms(db: Pool): Promise<void> {
  for (const p of STARTER_PLATFORMS) {
    const { rows } = await db.query('SELECT 1 FROM pam.platforms WHERE lower(slug) = lower($1)', [p.slug])
    if (rows.length) continue
    await db.query(
      `INSERT INTO pam.platforms (id, name, slug, base_type, connector_key, builtin, enabled, created_at, created_by)
       VALUES ($1,$2,$3,$4,$5,true,true,$6,'system')`,
      [newId(), p.name, p.slug, p.baseType, p.connectorKey, nowIso()]
    )
  }
}

async function seedGateway(db: Pool): Promise<void> {
  const { rows } = await db.query("SELECT 1 FROM pam.gateways WHERE kind = 'ssh' LIMIT 1")
  if (rows.length) return
  await db.query(
    `INSERT INTO pam.gateways (id, name, kind, address, protocols, enabled, created_at, created_by)
     VALUES ($1,'Default SSH Gateway','ssh',$2,'ssh',true,$3,'system')`,
    [newId(), process.env.NUXT_PAM_SSH_GATEWAY_ADDR || 'pam-ssh-gateway:4222', nowIso()]
  )
}

const DEFAULT_SETTINGS: Record<string, unknown> = {
  'reveal.default_seconds': 45,
  'reveal.disable_copy': false,
  'reveal.watermark': true,
  'reveal.rotate_after': false,
  'rotation.default_interval_days': 90,
  'session.idle_timeout_minutes': 15,
  'session.max_duration_minutes': 240,
  'zsp.enabled': false,
  'business_hours': { days: [1, 2, 3, 4, 5], start: '07:00', end: '19:00' },
  'break_glass.max_minutes': 60,
  'break_glass.require_incident': true,
  'audit.checkpoint_interval_minutes': 60
}

async function seedSettings(db: Pool): Promise<void> {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db.query(
      `INSERT INTO pam.settings (key, value, updated_at, updated_by) VALUES ($1,$2,$3,'system')
       ON CONFLICT (key) DO NOTHING`,
      [key, JSON.stringify(value), nowIso()]
    )
  }
}
