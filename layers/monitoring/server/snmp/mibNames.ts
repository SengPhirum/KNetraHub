import {
  SYS, IF, IPMIB, HR, UCD, ENTITY, ENT_SENSOR, BGP, OSPF, BRIDGE, LLDP, CDP, UPS, PRINTER, TRAPS
} from './oids'

/**
 * Best-effort numeric-OID → symbolic-name resolution for the diagnostic
 * capture/test surfaces, built from the same tables the engines use
 * (`oids.ts`). No MIB files at runtime: unknown OIDs simply stay numeric.
 */

interface OidEntry {
  oid: string
  name: string
  mib: string
}

const GROUPS: Array<[Record<string, string>, string]> = [
  [SYS, 'SNMPv2-MIB'],
  [IF, 'IF-MIB'],
  [IPMIB, 'IP-MIB'],
  [HR, 'HOST-RESOURCES-MIB'],
  [UCD, 'UCD-SNMP-MIB'],
  [ENTITY, 'ENTITY-MIB'],
  [ENT_SENSOR, 'ENTITY-SENSOR-MIB'],
  [BGP, 'BGP4-MIB'],
  [OSPF, 'OSPF-MIB'],
  [BRIDGE, 'BRIDGE-MIB'],
  [LLDP, 'LLDP-MIB'],
  [CDP, 'CISCO-CDP-MIB'],
  [UPS, 'UPS-MIB'],
  [PRINTER, 'Printer-MIB'],
  [TRAPS, 'SNMPv2-MIB']
]

const EXACT = new Map<string, OidEntry>()
const PREFIXES: OidEntry[] = []
for (const [table, mib] of GROUPS) {
  for (const [name, oid] of Object.entries(table)) {
    const entry: OidEntry = { oid, name, mib }
    if (!EXACT.has(oid)) EXACT.set(oid, entry)
    PREFIXES.push(entry)
  }
}
// Longest prefix first so ifXTable columns beat their parents etc.
PREFIXES.sort((a, b) => b.oid.length - a.oid.length)

/**
 * Resolve an OID to "MIB::name" (scalars) or "MIB::name.index" (table
 * cells). Returns null when nothing in the built-in tables matches.
 */
export function resolveOidName(oid: string): string | null {
  const normalized = oid.replace(/^\./, '')
  const exact = EXACT.get(normalized)
  if (exact) return `${exact.mib}::${exact.name}`
  for (const entry of PREFIXES) {
    if (normalized.startsWith(entry.oid + '.')) {
      return `${entry.mib}::${entry.name}.${normalized.slice(entry.oid.length + 1)}`
    }
  }
  return null
}

const OID_PATTERN = /^\.?\d+(\.\d+){1,127}$/

/** Syntactic OID validation for user-supplied capture/test input. */
export function isValidOid(oid: string): boolean {
  return typeof oid === 'string' && oid.length <= 512 && OID_PATTERN.test(oid)
}
