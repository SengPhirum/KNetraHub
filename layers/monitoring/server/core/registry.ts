import type { Pool } from 'pg'
import type { SnmpClient } from '../snmp/engine'
import type { CollectionOutcome } from '../../shared/constants'

/**
 * Registry-driven architecture: OS definitions, discovery modules, poller
 * modules, trap handlers, service checks and alert transports register here
 * at import time. No vendor if/else chains — capability lookups go through
 * these registries.
 */

// ── Shared execution context ─────────────────────────────────────────────────

export interface DeviceRow {
  id: number
  hostname: string
  display_name: string | null
  ip: string | null
  os: string
  os_override: string | null
  snmp_disabled: boolean
  status: string
  sys_object_id: string | null
  sys_descr: string | null
  uptime_seconds: number | null
  poller_group: number
  port_association_mode: string
  [key: string]: unknown
}

/** Records one planned item's final outcome (the no-silent-loss trail). */
export type AttemptRecorder = (item: string, outcome: CollectionOutcome, detail?: string, durationMs?: number) => void

export interface ModuleContext {
  db: Pool
  device: DeviceRow
  /** Null when the device is ICMP-only (snmp_disabled). */
  snmp: SnmpClient | null
  os: OsDefinition
  record: AttemptRecorder
  log: (msg: string) => void
}

export interface ModuleResult {
  /** success = did its work; empty = ran, nothing found; unsupported = device lacks the MIB. */
  status: 'success' | 'empty' | 'unsupported' | 'failed'
  error?: string
  /** Entities/metrics the module touched, for the module_runs rollup. */
  counts?: { planned?: number; succeeded?: number; empty?: number; unsupported?: number; skipped?: number; failed?: number }
}

// ── OS definitions ───────────────────────────────────────────────────────────

export interface OsDefinition {
  /** Stable id, e.g. 'linux', 'ios' */
  os: string
  text: string
  vendor?: string
  /** Match by sysObjectID prefix(es) — the strongest signal. */
  sysObjectIdPrefixes?: string[]
  /** And/or match by sysDescr regex. */
  sysDescrPatterns?: RegExp[]
  /** Higher wins when several definitions match (prefix length breaks ties). */
  priority?: number
  /** Discovery/poll modules this OS disables (on top of global defaults). */
  disabledModules?: { discovery?: string[]; poll?: string[] }
  /** Optional extractors for version/hardware/serial from sysDescr. */
  parseSysDescr?: (sysDescr: string) => { version?: string; hardware?: string; features?: string }
}

const osRegistry = new Map<string, OsDefinition>()

export function defineOs(def: OsDefinition): void {
  osRegistry.set(def.os, def)
}
export function getOs(os: string): OsDefinition {
  return osRegistry.get(os) ?? osRegistry.get('generic')!
}
export function allOs(): OsDefinition[] {
  return [...osRegistry.values()]
}

/** Pick the best OS definition for a device's sysObjectID + sysDescr. */
export function detectOs(sysObjectId: string | null, sysDescr: string | null): OsDefinition {
  let best: OsDefinition | null = null
  let bestScore = -1
  for (const def of osRegistry.values()) {
    let score = -1
    for (const prefix of def.sysObjectIdPrefixes ?? []) {
      if (sysObjectId && (sysObjectId === prefix || sysObjectId.startsWith(prefix + '.'))) {
        score = Math.max(score, 1000 + prefix.length + (def.priority ?? 0))
      }
    }
    for (const pattern of def.sysDescrPatterns ?? []) {
      if (sysDescr && pattern.test(sysDescr)) {
        score = Math.max(score, 100 + (def.priority ?? 0))
      }
    }
    if (score > bestScore) {
      bestScore = score
      best = def
    }
  }
  return bestScore >= 0 && best ? best : getOs('generic')
}

// ── Discovery + poller modules ───────────────────────────────────────────────

export interface EngineModule {
  name: string
  /** Order within a run (lower first — 'core' must run before the rest). */
  order?: number
  /** Enabled by default? (module_settings can override at any scope) */
  defaultEnabled: boolean
  /** Skip entirely for ICMP-only devices (most SNMP modules). */
  requiresSnmp?: boolean
  run: (ctx: ModuleContext) => Promise<ModuleResult>
}

const discoveryModules = new Map<string, EngineModule>()
const pollerModules = new Map<string, EngineModule>()

export function defineDiscoveryModule(mod: EngineModule): void {
  discoveryModules.set(mod.name, mod)
}
export function definePollerModule(mod: EngineModule): void {
  pollerModules.set(mod.name, mod)
}
export function getDiscoveryModules(): EngineModule[] {
  return [...discoveryModules.values()].sort((a, b) => (a.order ?? 100) - (b.order ?? 100))
}
export function getPollerModules(): EngineModule[] {
  return [...pollerModules.values()].sort((a, b) => (a.order ?? 100) - (b.order ?? 100))
}

// ── Trap handlers ────────────────────────────────────────────────────────────

export interface TrapContext {
  db: Pool
  deviceId: number | null
  sourceIp: string
  trapOid: string
  varbinds: { oid: string; type: string; value: unknown }[]
}
export interface TrapHandler {
  name: string
  /** Exact trap OID or prefix ending in '.' */
  match: string[]
  handle: (ctx: TrapContext) => Promise<{ message: string; eventType: string; severity: 'info' | 'warning' | 'error' } | null>
}

const trapHandlers: TrapHandler[] = []
export function defineTrapHandler(handler: TrapHandler): void {
  trapHandlers.push(handler)
}
export function findTrapHandler(trapOid: string): TrapHandler | null {
  for (const handler of trapHandlers) {
    for (const m of handler.match) {
      if (m.endsWith('.') ? trapOid.startsWith(m) : trapOid === m) return handler
    }
  }
  return null
}
export function allTrapHandlers(): TrapHandler[] {
  return [...trapHandlers]
}
