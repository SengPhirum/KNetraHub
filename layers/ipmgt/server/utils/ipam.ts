/**
 * IPAM address/CIDR engine. Dependency-free IPv4 + IPv6 math built on BigInt so
 * a single code path handles both families (v4 = 32-bit width, v6 = 128-bit).
 *
 * Free addresses are NOT stored as rows: a subnet's used/reserved/etc addresses
 * live in ipmgt_ips, and "free" is derived as capacity minus those. So the
 * engine here provides the math the API layer needs: validation, subnet
 * summaries, membership, overlap detection, first-free scanning, and host
 * enumeration for the visual subnet grid.
 */

export type IpVersion = 4 | 6

export interface CidrInfo {
  version: IpVersion
  /** Canonical network address string (e.g. "10.0.1.0" or "2001:db8::"). */
  network: string
  /** Prefix length (0-32 for v4, 0-128 for v6). */
  prefix: number
  /** Dotted netmask for v4 (e.g. "255.255.255.0"); prefix-form for v6. */
  netmask: string
  /** Wildcard (inverse) mask, v4 only; '' for v6. */
  wildcard: string
  /** Last address in the block (v4 broadcast). */
  broadcast: string
  /** First usable host (== network for /31,/32 and all v6). */
  firstUsable: string
  /** Last usable host (== broadcast for /31,/32 and all v6). */
  lastUsable: string
  /** Total addresses in the block, as a decimal string (v6 can exceed 2^53). */
  total: string
  /** Usable host count as a decimal string. */
  usable: string
  /** Network address as BigInt (internal ordering/membership). */
  networkInt: bigint
  /** Broadcast/last address as BigInt. */
  broadcastInt: bigint
}

const V4_MAX = 32
const V6_MAX = 128

function widthBits(version: IpVersion): number {
  return version === 4 ? V4_MAX : V6_MAX
}

// ─── detection & validation ─────────────────────────────────────────────────

export function detectVersion(ip: string): IpVersion | null {
  if (typeof ip !== 'string') return null
  const t = ip.trim()
  if (t.includes(':')) return isValidIpv6(t) ? 6 : null
  if (t.includes('.')) return isValidIpv4(t) ? 4 : null
  return null
}

export function isValidIp(ip: string): boolean {
  return detectVersion(ip) !== null
}

export function isValidIpv4(ip: string): boolean {
  const parts = String(ip).trim().split('.')
  if (parts.length !== 4) return false
  return parts.every((p) => {
    if (!/^\d{1,3}$/.test(p)) return false
    const n = Number(p)
    return n >= 0 && n <= 255 && String(n) === String(Number(p))
  })
}

export function isValidIpv6(ip: string): boolean {
  try {
    ipv6ToBigInt(String(ip).trim())
    return true
  } catch {
    return false
  }
}

// ─── ip <-> bigint ───────────────────────────────────────────────────────────

export function ipToBigInt(ip: string, version?: IpVersion): bigint {
  const v = version ?? detectVersion(ip)
  if (v === 4) return ipv4ToBigInt(ip)
  if (v === 6) return ipv6ToBigInt(ip)
  throw new Error(`Invalid IP address: ${ip}`)
}

export function bigIntToIp(n: bigint, version: IpVersion): string {
  return version === 4 ? bigIntToIpv4(n) : bigIntToIpv6(n)
}

function ipv4ToBigInt(ip: string): bigint {
  if (!isValidIpv4(ip)) throw new Error(`Invalid IPv4 address: ${ip}`)
  return ip.trim().split('.').reduce((acc, oct) => (acc << 8n) + BigInt(Number(oct)), 0n)
}

function bigIntToIpv4(n: bigint): string {
  return [24n, 16n, 8n, 0n].map((s) => Number((n >> s) & 0xffn)).join('.')
}

function ipv6ToBigInt(ip: string): bigint {
  let str = ip.trim().toLowerCase()
  // Reject zone id (e.g. fe80::1%eth0) and empty.
  if (!str || str.includes('%')) throw new Error(`Invalid IPv6 address: ${ip}`)

  // Handle embedded IPv4 (e.g. ::ffff:192.168.1.1) by converting the tail.
  const lastColon = str.lastIndexOf(':')
  if (str.slice(lastColon + 1).includes('.')) {
    const v4 = str.slice(lastColon + 1)
    if (!isValidIpv4(v4)) throw new Error(`Invalid IPv6 address: ${ip}`)
    const v4Int = ipv4ToBigInt(v4)
    const high = Number((v4Int >> 16n) & 0xffffn).toString(16)
    const low = Number(v4Int & 0xffffn).toString(16)
    str = str.slice(0, lastColon + 1) + high + ':' + low
  }

  const halves = str.split('::')
  if (halves.length > 2) throw new Error(`Invalid IPv6 address: ${ip}`)

  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 ? (halves[1] ? halves[1].split(':') : []) : []

  let groups: string[]
  if (halves.length === 2) {
    const missing = 8 - head.length - tail.length
    if (missing < 0) throw new Error(`Invalid IPv6 address: ${ip}`)
    groups = [...head, ...Array(missing).fill('0'), ...tail]
  } else {
    groups = head
  }
  if (groups.length !== 8) throw new Error(`Invalid IPv6 address: ${ip}`)

  let result = 0n
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) throw new Error(`Invalid IPv6 hextet: ${g}`)
    result = (result << 16n) + BigInt(parseInt(g, 16))
  }
  return result
}

function bigIntToIpv6(n: bigint): string {
  const hextets: string[] = []
  for (let i = 7n; i >= 0n; i--) {
    hextets.push(Number((n >> (i * 16n)) & 0xffffn).toString(16))
  }
  return compressIpv6(hextets)
}

/** RFC 5952 canonical compression: longest run of zero hextets → "::". */
function compressIpv6(hextets: string[]): string {
  let bestStart = -1
  let bestLen = 0
  let curStart = -1
  let curLen = 0
  for (let i = 0; i < 8; i++) {
    if (hextets[i] === '0') {
      if (curStart === -1) curStart = i
      curLen++
      if (curLen > bestLen) {
        bestLen = curLen
        bestStart = curStart
      }
    } else {
      curStart = -1
      curLen = 0
    }
  }
  if (bestLen < 2) return hextets.join(':')
  const before = hextets.slice(0, bestStart).join(':')
  const after = hextets.slice(bestStart + bestLen).join(':')
  return `${before}::${after}`
}

/** Canonicalize any valid IP string to its stored/compared form. */
export function canonicalizeIp(ip: string): string {
  const v = detectVersion(ip)
  if (v === 4) return bigIntToIpv4(ipv4ToBigInt(ip))
  if (v === 6) return bigIntToIpv6(ipv6ToBigInt(ip))
  throw new Error(`Invalid IP address: ${ip}`)
}

// ─── mask helpers ────────────────────────────────────────────────────────────

function maskBigInt(prefix: number, version: IpVersion): bigint {
  const width = widthBits(version)
  if (prefix < 0 || prefix > width) throw new Error(`Invalid prefix /${prefix}`)
  if (prefix === 0) return 0n
  const full = (1n << BigInt(width)) - 1n
  return (full << BigInt(width - prefix)) & full
}

function ipv4Netmask(prefix: number): string {
  return bigIntToIpv4(maskBigInt(prefix, 4))
}

function ipv4Wildcard(prefix: number): string {
  const full = (1n << 32n) - 1n
  return bigIntToIpv4(full ^ maskBigInt(prefix, 4))
}

// ─── CIDR parsing & summary ──────────────────────────────────────────────────

/** Parse "10.0.1.0/24" (or a bare IP → host /32 or /128). Throws on invalid. */
export function parseCidr(cidr: string): { version: IpVersion; networkInt: bigint; prefix: number } {
  if (typeof cidr !== 'string' || !cidr.trim()) throw new Error('CIDR is required')
  const [addr, prefixStr] = cidr.trim().split('/')
  const version = detectVersion(addr!)
  if (!version) throw new Error(`Invalid CIDR address: ${cidr}`)
  const width = widthBits(version)
  const prefix = prefixStr === undefined ? width : Number(prefixStr)
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > width) {
    throw new Error(`Invalid prefix length in ${cidr}`)
  }
  const ipInt = ipToBigInt(addr!, version)
  const networkInt = ipInt & maskBigInt(prefix, version)
  return { version, networkInt, prefix }
}

export function isValidCidr(cidr: string): boolean {
  try {
    parseCidr(cidr)
    return true
  } catch {
    return false
  }
}

/** Full summary of a CIDR block (drives the calculator + subnet detail page). */
export function cidrInfo(cidr: string): CidrInfo {
  const { version, networkInt, prefix } = parseCidr(cidr)
  const width = widthBits(version)
  const hostBits = width - prefix
  const totalBig = 1n << BigInt(hostBits)
  const broadcastInt = networkInt + totalBig - 1n

  let firstUsableInt = networkInt
  let lastUsableInt = broadcastInt
  let usableBig = totalBig

  if (version === 4) {
    if (prefix < 31) {
      firstUsableInt = networkInt + 1n
      lastUsableInt = broadcastInt - 1n
      usableBig = totalBig - 2n
    }
    // /31 (point-to-point) and /32 (host): both addresses usable.
  }

  return {
    version,
    network: bigIntToIp(networkInt, version),
    prefix,
    netmask: version === 4 ? ipv4Netmask(prefix) : `/${prefix}`,
    wildcard: version === 4 ? ipv4Wildcard(prefix) : '',
    broadcast: bigIntToIp(broadcastInt, version),
    firstUsable: bigIntToIp(firstUsableInt, version),
    lastUsable: bigIntToIp(lastUsableInt, version),
    total: totalBig.toString(),
    usable: (usableBig < 0n ? 0n : usableBig).toString(),
    networkInt,
    broadcastInt
  }
}

// ─── membership & overlap ────────────────────────────────────────────────────

/** Is `ip` inside `cidr` (same family, within the block range)? */
export function ipInCidr(ip: string, cidr: string): boolean {
  const v = detectVersion(ip)
  if (!v) return false
  let info: { version: IpVersion; networkInt: bigint; prefix: number }
  try {
    info = parseCidr(cidr)
  } catch {
    return false
  }
  if (info.version !== v) return false
  const ipInt = ipToBigInt(ip, v)
  const width = widthBits(v)
  const broadcast = info.networkInt + (1n << BigInt(width - info.prefix)) - 1n
  return ipInt >= info.networkInt && ipInt <= broadcast
}

/** Do two CIDR blocks overlap? (One containing the other counts as overlap.) */
export function cidrsOverlap(a: string, b: string): boolean {
  let ia, ib
  try {
    ia = parseCidr(a)
    ib = parseCidr(b)
  } catch {
    return false
  }
  if (ia.version !== ib.version) return false
  const width = widthBits(ia.version)
  const aEnd = ia.networkInt + (1n << BigInt(width - ia.prefix)) - 1n
  const bEnd = ib.networkInt + (1n << BigInt(width - ib.prefix)) - 1n
  return ia.networkInt <= bEnd && ib.networkInt <= aEnd
}

/** Is child fully contained within parent (proper nesting for subnet trees)? */
export function cidrContains(parent: string, child: string): boolean {
  let p, c
  try {
    p = parseCidr(parent)
    c = parseCidr(child)
  } catch {
    return false
  }
  if (p.version !== c.version || c.prefix < p.prefix) return false
  const width = widthBits(p.version)
  const pEnd = p.networkInt + (1n << BigInt(width - p.prefix)) - 1n
  const cEnd = c.networkInt + (1n << BigInt(width - c.prefix)) - 1n
  return c.networkInt >= p.networkInt && cEnd <= pEnd
}

// ─── free-space helpers ──────────────────────────────────────────────────────

/** Max hosts we enumerate for the visual grid (protects against huge blocks). */
export const MAX_GRID_HOSTS = 4096

/**
 * First free address in `cidr` not present in `usedCanonical` (a Set of
 * canonicalized IP strings). Scans from the first usable host; capped so a
 * sparse /8 doesn't spin forever (first-free is near the start in practice).
 */
export function firstFreeIp(cidr: string, usedCanonical: Set<string>, scanLimit = 100000): string | null {
  const info = cidrInfo(cidr)
  const firstInt = ipToBigInt(info.firstUsable, info.version)
  const lastInt = ipToBigInt(info.lastUsable, info.version)
  let count = 0
  for (let n = firstInt; n <= lastInt && count < scanLimit; n++, count++) {
    const ip = bigIntToIp(n, info.version)
    if (!usedCanonical.has(ip)) return ip
  }
  return null
}

export interface HostCell {
  ip: string
  offset: number
  isNetwork: boolean
  isBroadcast: boolean
  isGateway: boolean
}

/**
 * Enumerate up to `limit` host cells of a subnet for the visual grid. Marks the
 * network, broadcast, and gateway positions. Large blocks are truncated (the
 * caller shows a "showing first N of M" hint).
 */
export function enumerateHosts(cidr: string, gateway: string | null, limit = MAX_GRID_HOSTS): { cells: HostCell[]; truncated: boolean; total: string } {
  const info = cidrInfo(cidr)
  const startInt = info.networkInt
  const endInt = info.broadcastInt
  const gatewayCanon = gateway && isValidIp(gateway) ? canonicalizeIp(gateway) : null
  const cells: HostCell[] = []
  let n = startInt
  let offset = 0
  let truncated = false
  while (n <= endInt) {
    if (cells.length >= limit) {
      truncated = true
      break
    }
    const ip = bigIntToIp(n, info.version)
    cells.push({
      ip,
      offset,
      isNetwork: info.version === 4 && info.prefix < 31 && n === startInt,
      isBroadcast: info.version === 4 && info.prefix < 31 && n === endInt,
      isGateway: gatewayCanon !== null && ip === gatewayCanon
    })
    n++
    offset++
  }
  return { cells, truncated, total: info.total }
}

/**
 * Usable-host capacity of a subnet as a JS number, clamped to
 * Number.MAX_SAFE_INTEGER for enormous v6 blocks (usage percentages only ever
 * need an approximation once a subnet is astronomically large).
 */
export function usableCapacity(cidr: string): number {
  const info = cidrInfo(cidr)
  const big = BigInt(info.usable)
  const cap = BigInt(Number.MAX_SAFE_INTEGER)
  return Number(big > cap ? cap : big)
}
