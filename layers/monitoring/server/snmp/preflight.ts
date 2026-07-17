import ping from 'ping'
import type { Pool } from 'pg'
import { decryptSecret } from '~~/server/utils/secretCrypto'
import { SnmpClient, describeSnmpTarget, type ResolvedSnmpConfig } from './engine'
import { SYS } from './oids'
import { resolveOidName } from './mibNames'
import type { SnmpValue } from './values'
import { detectOs } from '../core/registry'
import type { CollectionOutcome } from '../../shared/constants'
import type { InlineSnmpInput } from './inlineConfig'

/**
 * Ad-hoc reachability + SNMP query testing, shared by the add-device
 * preflight, POST /snmp/test and the device Capture tab. Everything here is
 * ephemeral — nothing is persisted, secrets never appear in any result.
 */

export interface IcmpTestResult {
  alive: boolean
  rttMs: number | null
  error?: string
}

export async function testIcmp(host: string, timeoutMs = 2000): Promise<IcmpTestResult> {
  try {
    const res = await ping.promise.probe(host, { timeout: Math.max(1, Math.ceil(timeoutMs / 1000)), min_reply: 1 })
    const rtt = res.time === 'unknown' ? null : Number(res.time)
    return { alive: !!res.alive, rttMs: res.alive ? rtt : null }
  } catch (err) {
    return { alive: false, rttMs: null, error: String((err as any)?.message ?? err) }
  }
}

/** JSON-safe rendering of an SnmpValue (Counter64 bigints → strings). */
export function serializeSnmpValue(v: SnmpValue | null): { type: string; value: string | number | null; hex?: string } {
  if (!v) return { type: 'Null', value: null }
  return {
    type: v.typeName,
    value: typeof v.value === 'bigint' ? v.value.toString() : v.value,
    ...(v.rawHex ? { hex: v.rawHex } : {})
  }
}

export interface SnmpRawRow {
  oid: string
  name: string | null
  type: string
  value: string | number | null
  hex?: string
}

export type SnmpTestResult =
  | {
      ok: true
      durationMs: number
      target: string
      system: {
        sysName: string | null
        sysDescr: string | null
        sysObjectID: string | null
        sysContact: string | null
        sysLocation: string | null
        uptimeSeconds: number | null
      }
      detected: { os: string; text: string; vendor?: string }
      raw: SnmpRawRow[]
    }
  | { ok: false; durationMs: number; target: string; outcome: CollectionOutcome; error: string }

/**
 * Query test: GET the SNMPv2-MIB system scalars and report both parsed
 * system identity and the raw varbinds (LibreNMS "test connectivity"
 * equivalent, with the raw data visible).
 */
export async function testSnmp(cfg: ResolvedSnmpConfig): Promise<SnmpTestResult> {
  const target = describeSnmpTarget(cfg)
  let client: SnmpClient | null = null
  try {
    client = new SnmpClient(cfg)
    const oids = Object.values(SYS) as string[]
    const res = await client.get(oids)
    if (!res.ok) return { ok: false, durationMs: res.durationMs, target, outcome: res.outcome, error: res.error }

    const str = (oid: string) => {
      const v = res.value[oid]?.value
      return v == null ? null : String(v)
    }
    const sysDescr = str(SYS.sysDescr)
    const sysObjectID = str(SYS.sysObjectID)
    const upTicks = res.value[SYS.sysUpTime]?.value
    const os = detectOs(sysObjectID, sysDescr)

    // A device that answers the GET but returns no system scalars at all is
    // effectively not talking SNMP usefully — surface that as unsupported.
    if (oids.every((oid) => res.value[oid] == null)) {
      return { ok: false, durationMs: res.durationMs, target, outcome: 'unsupported', error: 'device answered but returned no system scalars' }
    }

    return {
      ok: true,
      durationMs: res.durationMs,
      target,
      system: {
        sysName: str(SYS.sysName),
        sysDescr,
        sysObjectID,
        sysContact: str(SYS.sysContact),
        sysLocation: str(SYS.sysLocation),
        uptimeSeconds: typeof upTicks === 'number' ? Math.floor(upTicks / 100) : null
      },
      detected: { os: os.os, text: os.text, ...(os.vendor ? { vendor: os.vendor } : {}) },
      raw: oids.map((oid) => ({ oid, name: resolveOidName(oid), ...serializeSnmpValue(res.value[oid] ?? null) }))
    }
  } catch (err) {
    return { ok: false, durationMs: 0, target, outcome: 'failed', error: String((err as any)?.message ?? err) }
  } finally {
    client?.close()
  }
}

function decryptProfileRow(row: Record<string, any>): Partial<InlineSnmpInput> {
  return {
    version: row.snmp_version,
    port: row.snmp_port,
    context: row.snmp_context,
    community: row.snmp_community ? decryptSecret(row.snmp_community) : null,
    v3_level: row.v3_level,
    v3_username: row.v3_username,
    v3_auth_protocol: row.v3_auth_protocol,
    v3_auth_password: row.v3_auth_password ? decryptSecret(row.v3_auth_password) : null,
    v3_priv_protocol: row.v3_priv_protocol,
    v3_priv_password: row.v3_priv_password ? decryptSecret(row.v3_priv_password) : null
  }
}

/** Load a credential profile with its secrets decrypted (fallback values for inline configs). */
export async function loadDecryptedProfile(db: Pool, profileId: number): Promise<Partial<InlineSnmpInput> | null> {
  const res = await db.query('SELECT * FROM monitoring.credential_profiles WHERE id = $1', [profileId])
  return res.rows[0] ? decryptProfileRow(res.rows[0]) : null
}

/** All profiles in attempt order, decrypted — for candidate-style preflights. */
export async function loadAllDecryptedProfiles(db: Pool): Promise<Array<{ id: number; name: string; input: Partial<InlineSnmpInput> }>> {
  const res = await db.query('SELECT * FROM monitoring.credential_profiles ORDER BY attempt_order ASC, id ASC')
  return res.rows.map((row: any) => ({ id: Number(row.id), name: row.name, input: decryptProfileRow(row) }))
}

export { buildInlineSnmpConfig, type InlineSnmpInput } from './inlineConfig'
