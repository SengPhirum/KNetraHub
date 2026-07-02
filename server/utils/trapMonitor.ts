import { nanoid } from 'nanoid'
import { getDb } from './db'
import { isHostUnderMaintenance, fireServerActions } from './serverMonitor'

/**
 * SNMP trap classification + handling for server/plugins/trapReceiver.ts. Every
 * received trap is logged to server_traps; well-known traps (link down/up,
 * cold/warm start, auth failure) additionally open/resolve a server_problems
 * row when the source IP matches a known host, going through the same
 * maintenance-suppression + Actions path as trigger-based problems.
 */

interface TrapMeta { name: string; severity: number }

// SNMPv2-MIB standard trap OIDs (used by v2c/v3 notifications, where the trap
// identity is the snmpTrapOID.0 varbind rather than a generic/specific pair).
const STANDARD_TRAP_OIDS: Record<string, TrapMeta> = {
  '1.3.6.1.6.3.1.1.5.1': { name: 'Cold Start', severity: 1 },
  '1.3.6.1.6.3.1.1.5.2': { name: 'Warm Start', severity: 1 },
  '1.3.6.1.6.3.1.1.5.3': { name: 'Link Down', severity: 4 },
  '1.3.6.1.6.3.1.1.5.4': { name: 'Link Up', severity: 1 },
  '1.3.6.1.6.3.1.1.5.5': { name: 'Authentication Failure', severity: 2 },
  '1.3.6.1.6.3.1.1.5.6': { name: 'EGP Neighbor Loss', severity: 2 }
}

// v1 Trap-PDU `generic` field (0-6); 6 = enterpriseSpecific, handled separately.
const GENERIC_TRAP_META: Record<number, TrapMeta> = {
  0: { name: 'Cold Start', severity: 1 },
  1: { name: 'Warm Start', severity: 1 },
  2: { name: 'Link Down', severity: 4 },
  3: { name: 'Link Up', severity: 1 },
  4: { name: 'Authentication Failure', severity: 2 },
  5: { name: 'EGP Neighbor Loss', severity: 2 }
}

const SNMP_TRAP_OID_VARBIND = '1.3.6.1.6.3.1.1.4.1.0'

function valueToString(v: any): string {
  if (v == null) return ''
  if (Buffer.isBuffer(v)) return v.toString('utf8')
  return String(v)
}

function classifyTrap(pdu: any): { version: 'v1' | 'v2c/v3'; trapOid: string | null; name: string; severity: number } {
  // v1 Trap-PDU: has generic/specific/enterprise fields, no snmpTrapOID varbind.
  if (typeof pdu.generic === 'number') {
    if (pdu.generic !== 6) {
      const meta = GENERIC_TRAP_META[pdu.generic] || { name: `Trap (generic ${pdu.generic})`, severity: 3 }
      return { version: 'v1', trapOid: null, name: meta.name, severity: meta.severity }
    }
    const trapOid = `${pdu.enterprise}.${pdu.specific}`
    return { version: 'v1', trapOid, name: `Enterprise trap ${trapOid}`, severity: 3 }
  }

  // v2c/v3: identity comes from the snmpTrapOID.0 varbind.
  const varbinds: any[] = pdu.varbinds || []
  const idVb = varbinds.find((v) => String(v.oid) === SNMP_TRAP_OID_VARBIND)
  const trapOid = idVb ? valueToString(idVb.value) : null
  if (trapOid && STANDARD_TRAP_OIDS[trapOid]) {
    const meta = STANDARD_TRAP_OIDS[trapOid]
    return { version: 'v2c/v3', trapOid, name: meta.name, severity: meta.severity }
  }
  return { version: 'v2c/v3', trapOid, name: trapOid ? `Trap ${trapOid}` : 'Unknown trap', severity: 3 }
}

/** Handle one received trap: log it, and for well-known traps from a known
 *  host, open or resolve a problem. Best-effort — errors are logged, never thrown
 *  (a malformed trap must not crash the receiver). */
export async function handleTrap(pdu: any, sourceIp: string): Promise<void> {
  const db = getDb()
  const now = new Date().toISOString()
  const { version, trapOid, name, severity } = classifyTrap(pdu)

  const varbinds = JSON.stringify((pdu.varbinds || []).map((v: any) => ({ oid: String(v.oid), value: valueToString(v.value) })).slice(0, 50))

  const hostRes = await db.query('SELECT id, name FROM server_hosts WHERE ip = $1 LIMIT 1', [sourceIp])
  const host = hostRes.rows[0] || null

  await db.query(
    `INSERT INTO server_traps (id, host_id, source_ip, version, trap_oid, name, severity_num, varbinds, received_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [nanoid(), host?.id || null, sourceIp, version, trapOid, name, severity, varbinds, now]
  )

  if (!host) return // can't correlate to a known host - logged only

  if (name === 'Link Up') {
    await db.query(
      `UPDATE server_problems SET status = 'resolved', r_clock = $1 WHERE host_id = $2 AND name = 'Link Down' AND status = 'problem' AND trigger_id IS NULL`,
      [now, host.id]
    )
    return
  }
  if (name === 'Link Down' || name === 'Authentication Failure' || name === 'EGP Neighbor Loss') {
    await openTrapProblem(host, name, severity, now)
  }
}

async function openTrapProblem(host: { id: string; name: string }, name: string, severity: number, now: string) {
  const db = getDb()
  const open = await db.query(
    `SELECT id FROM server_problems WHERE host_id = $1 AND name = $2 AND status = 'problem' AND trigger_id IS NULL LIMIT 1`,
    [host.id, name]
  )
  if (open.rows.length) return

  const suppressed = await isHostUnderMaintenance(host.id)
  await db.query(
    `INSERT INTO server_problems (id, host_id, trigger_id, trigger, name, severity_num, fired_at, status, ack, suppressed)
     VALUES ($1,$2,NULL,$3,$3,$4,$5,'problem',false,$6)`,
    [nanoid(), host.id, name, severity, now, suppressed]
  )
  if (!suppressed) await fireServerActions(host.name, name, severity)
}
