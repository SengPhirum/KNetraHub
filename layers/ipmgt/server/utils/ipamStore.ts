import type { H3Event } from 'h3'
import { nanoid } from 'nanoid'
import { getDb } from '~~/server/utils/db'
import { audit } from '~~/server/utils/store'
import { requireApp } from '~~/server/utils/auth'
import type { SessionUser } from '~~/server/utils/auth'
import type { AppTier } from '~~/shared/utils/entitlements'
import {
  canonicalizeIp,
  cidrInfo,
  cidrsOverlap,
  ipToBigInt,
  isValidIp,
  parseCidr,
  usableCapacity
} from '~~/layers/ipmgt/server/utils/ipam'

/** Canonical address lifecycle states (free is implicit — never stored). */
export const IP_STATUSES = ['used', 'reserved', 'dhcp', 'offline', 'deprecated', 'gateway'] as const
export type IpStatus = typeof IP_STATUSES[number]

/**
 * Gate an IPAM API route at a minimum ipmgt tier and return the caller. Uses
 * requireApp (resolves live from realm roles + the role map) rather than the
 * route-prefix middleware, which only covers the Dock app. viewer→read,
 * operator→write/assign, manager→approve, admin→delete/settings.
 */
export function requireIpam(event: H3Event, min: AppTier = 'viewer'): Promise<SessionUser> {
  return requireApp(event, 'ipmgt', min)
}

/** Write a portal audit row for an IPAM action (actor = username). */
export async function ipamAudit(user: SessionUser, action: string, target: string | null, detail?: unknown): Promise<void> {
  await audit({
    actor: user.username,
    action,
    target: target ?? undefined,
    detail: detail === undefined ? undefined : typeof detail === 'string' ? detail : JSON.stringify(detail)
  })
}

/** Append a row to an address's history timeline. */
export async function recordIpHistory(input: {
  ipId: string | null
  subnetId: string | null
  ip: string
  action: string
  actor: string
  detail?: string
}): Promise<void> {
  await getDb().query(
    `INSERT INTO ipmgt_ip_history (id, ip_id, subnet_id, ip, action, actor, detail, changed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [nanoid(), input.ipId, input.subnetId, input.ip, input.action, input.actor, input.detail ?? null, new Date().toISOString()]
  )
}

export interface SubnetRow {
  id: string
  name: string
  network: string
  version: number
  prefix: number | null
  gateway: string | null
  vrf_id: string | null
  section_id: string | null
  [k: string]: any
}

/** Load a subnet or throw 404. */
export async function loadSubnet(id: string): Promise<SubnetRow> {
  const { rows } = await getDb().query('SELECT * FROM ipmgt_subnets WHERE id = $1', [id])
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Subnet not found' })
  return rows[0] as SubnetRow
}

/**
 * Usage stats for a subnet: capacity (usable hosts) and how many addresses are
 * defined (used). Free is derived. Percentages clamp at 100.
 */
export async function subnetUsage(subnet: SubnetRow): Promise<{ capacity: number; used: number; free: number; percent: number }> {
  const capacity = usableCapacity(subnet.network)
  const { rows } = await getDb().query('SELECT count(*)::int AS c FROM ipmgt_ips WHERE subnet_id = $1', [subnet.id])
  const used = Number(rows[0].c)
  const free = Math.max(0, capacity - used)
  const percent = capacity > 0 ? Math.min(100, Math.round((used / capacity) * 100)) : 0
  return { capacity, used, free, percent }
}

/**
 * Reject a new/edited subnet that overlaps an existing one within the same
 * section or VRF. Overlap across different VRFs is allowed (that's the whole
 * point of a VRF). `excludeId` skips the row being edited.
 */
export async function assertNoSubnetOverlap(
  network: string,
  opts: { sectionId?: string | null; vrfId?: string | null; excludeId?: string | null }
): Promise<void> {
  const { version } = parseCidr(network)
  const { rows } = await getDb().query('SELECT id, network, section_id, vrf_id FROM ipmgt_subnets WHERE version = $1', [version])
  for (const row of rows) {
    if (opts.excludeId && row.id === opts.excludeId) continue
    // Different VRF → overlapping space is permitted.
    if ((opts.vrfId || null) !== (row.vrf_id || null)) continue
    if (!cidrsOverlap(network, row.network)) continue
    throw createError({
      statusCode: 409,
      statusMessage: `Subnet ${network} overlaps existing subnet ${row.network}${row.vrf_id ? '' : ' (no VRF)'}`
    })
  }
}

/**
 * Validate a candidate address for a subnet: must be a valid IP, inside the
 * subnet range, and not already defined (duplicate) unless it's the row being
 * edited. Returns the canonical form to store.
 */
export async function validateAddressForSubnet(
  ip: string,
  subnet: SubnetRow,
  excludeId?: string | null
): Promise<string> {
  if (!isValidIp(ip)) throw createError({ statusCode: 400, statusMessage: `Invalid IP address: ${ip}` })
  const canon = canonicalizeIp(ip)
  const info = cidrInfo(subnet.network)
  if (info.version !== (ip.includes(':') ? 6 : 4)) {
    throw createError({ statusCode: 400, statusMessage: 'IP family does not match subnet' })
  }
  // Range membership.
  const { networkInt, broadcastInt } = info
  const ipInt = ipToBigInt(canon, info.version)
  if (ipInt < networkInt || ipInt > broadcastInt) {
    throw createError({ statusCode: 400, statusMessage: `${ip} is not within subnet ${subnet.network}` })
  }
  // Duplicate within the same subnet.
  const { rows } = await getDb().query('SELECT id, ip FROM ipmgt_ips WHERE subnet_id = $1', [subnet.id])
  for (const row of rows) {
    if (excludeId && row.id === excludeId) continue
    if (canonicalizeIp(row.ip) === canon) {
      throw createError({ statusCode: 409, statusMessage: `${canon} already exists in this subnet` })
    }
  }
  return canon
}

/** Normalize a posted status to a valid one (defaults to 'used'). */
export function normalizeStatus(input: unknown): IpStatus {
  const s = String(input || '').toLowerCase()
  return (IP_STATUSES as readonly string[]).includes(s) ? (s as IpStatus) : 'used'
}

/** Canonical customer lifecycle states. */
export const CUSTOMER_STATUSES = ['active', 'reserved', 'inactive'] as const
export type CustomerStatus = typeof CUSTOMER_STATUSES[number]

/** Normalize a posted customer status (defaults to 'active'). */
export function normalizeCustomerStatus(input: unknown): CustomerStatus {
  const s = String(input || '').toLowerCase()
  return (CUSTOMER_STATUSES as readonly string[]).includes(s) ? (s as CustomerStatus) : 'active'
}

/** Canonical device lifecycle states. */
export const DEVICE_STATUSES = ['active', 'inactive', 'maintenance', 'decommissioned'] as const
export type DeviceStatus = typeof DEVICE_STATUSES[number]

/** Normalize a posted device status (defaults to 'active'). */
export function normalizeDeviceStatus(input: unknown): DeviceStatus {
  const s = String(input || '').toLowerCase()
  return (DEVICE_STATUSES as readonly string[]).includes(s) ? (s as DeviceStatus) : 'active'
}

/**
 * Strip encrypted SNMP secret columns from a device row before it ever
 * leaves the server. Replaces each *_enc column with a `_set` boolean so the
 * UI can show "configured" without ever seeing ciphertext or plaintext.
 */
export function stripDeviceSnmpSecrets<T extends Record<string, any>>(row: T): Omit<T, 'snmp_community_enc' | 'snmp_auth_password_enc' | 'snmp_priv_password_enc'> & {
  snmp_community_set: boolean
  snmp_auth_password_set: boolean
  snmp_priv_password_set: boolean
} {
  const { snmp_community_enc, snmp_auth_password_enc, snmp_priv_password_enc, ...rest } = row
  return {
    ...rest,
    snmp_community_set: !!snmp_community_enc,
    snmp_auth_password_set: !!snmp_auth_password_enc,
    snmp_priv_password_set: !!snmp_priv_password_enc
  }
}

/** One dependency check for usedByRows(): does `table.col = id` have any rows? */
export interface UsedByCheck {
  table: string
  col: string
  type: string
  nameCol: string
}

/**
 * Find records elsewhere in IPAM that reference `id` via any of `checks`,
 * for building a 409 "usedBy" conflict payload (rendered by
 * ConfirmPasswordModal.vue) before allowing a Location/Customer/Device
 * delete. Table/column names are fixed, compile-time-known strings passed by
 * each delete handler - never derived from request input.
 */
export async function usedByRows(id: string, checks: UsedByCheck[], max = 8): Promise<{ type: string; name: string }[]> {
  const db = getDb()
  const found: { type: string; name: string }[] = []
  for (const check of checks) {
    const { rows } = await db.query(
      `SELECT ${check.nameCol} AS name FROM ${check.table} WHERE ${check.col} = $1 LIMIT $2`,
      [id, max + 1]
    )
    for (const row of rows) found.push({ type: check.type, name: String(row.name ?? '') })
  }
  return found
}
