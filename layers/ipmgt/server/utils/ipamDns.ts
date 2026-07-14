import { canonicalizeIp, cidrInfo, ipToBigInt, isValidIp } from '~~/layers/ipmgt/server/utils/ipam'

/**
 * DNS reverse-zone math and PTR-name computation. Self-contained (no
 * external DNS server dependency) - this computes what a correct reverse
 * zone/PTR name *should* be, for the reverse-zone reference panel and the
 * DNS consistency checker tool. Actually pushing records to an external
 * DNS/PowerDNS server is out of scope here (see layers/ipmgt/app/pages/
 * ipmgt/settings.vue's existing, honestly-disclosed placeholder for that).
 */

/** PTR owner name for a single IPv4/IPv6 address, e.g. "5.1.0.10.in-addr.arpa". */
export function ptrNameForIp(ip: string): string {
  if (!isValidIp(ip)) throw new Error(`Invalid IP: ${ip}`)
  const canon = canonicalizeIp(ip)
  if (canon.includes(':')) {
    const info = cidrInfo(`${canon}/128`)
    const hex = info.networkInt.toString(16).padStart(32, '0')
    return hex.split('').reverse().join('.') + '.ip6.arpa'
  }
  return canon.split('.').reverse().join('.') + '.in-addr.arpa'
}

/**
 * Reverse zone(s) that cover a CIDR. IPv4 /24-or-longer subnets sit inside
 * exactly one classic in-addr.arpa zone; shorter prefixes span multiple /24
 * zones (enumerated up to `maxZones`, matching the visual-grid truncation
 * convention elsewhere in this module). IPv6 zones are delegated at the
 * nearest 4-bit (nibble) boundary at or above the prefix length.
 */
export function reverseZonesForCidr(cidr: string, maxZones = 256): { zones: string[]; truncated: boolean } {
  const info = cidrInfo(cidr)
  if (info.version === 6) {
    const nibbleBoundary = Math.ceil(info.prefix / 4) * 4
    const hex = info.networkInt.toString(16).padStart(32, '0')
    const nibbles = hex.slice(0, nibbleBoundary / 4)
    return { zones: [nibbles.split('').reverse().join('.') + '.ip6.arpa'], truncated: false }
  }
  if (info.prefix >= 24) {
    const octets = info.network.split('.')
    return { zones: [`${octets[2]}.${octets[1]}.${octets[0]}.in-addr.arpa`], truncated: false }
  }
  // Shorter than /24: one zone per /24 block within the subnet.
  const blockCount = 2 ** (24 - info.prefix)
  const zones: string[] = []
  let truncated = false
  const baseInt = info.networkInt
  for (let i = 0; i < blockCount; i++) {
    if (zones.length >= maxZones) { truncated = true; break }
    const blockNetInt = baseInt + BigInt(i) * 256n
    const octets = [
      (blockNetInt >> 24n) & 0xffn,
      (blockNetInt >> 16n) & 0xffn,
      (blockNetInt >> 8n) & 0xffn
    ]
    zones.push(`${octets[2]}.${octets[1]}.${octets[0]}.in-addr.arpa`)
  }
  return { zones, truncated }
}

export interface DnsInconsistency {
  ip: string
  hostname: string | null
  recordedPtr: string | null
  expectedPtr: string
  issue: 'missing_ptr' | 'ptr_mismatch'
}

/** Flag addresses whose recorded PTR doesn't match what it should be for a hostname-bearing record (and isn't explicitly ptr-ignored). */
export function checkDnsConsistency(addresses: { ip: string; hostname: string | null; ptr: string | null; ptr_ignore?: boolean }[]): DnsInconsistency[] {
  const out: DnsInconsistency[] = []
  for (const a of addresses) {
    if (!a.hostname || a.ptr_ignore) continue
    let expectedPtr: string
    try { expectedPtr = ptrNameForIp(a.ip) } catch { continue }
    if (!a.ptr) { out.push({ ip: a.ip, hostname: a.hostname, recordedPtr: null, expectedPtr, issue: 'missing_ptr' }); continue }
    if (a.ptr.trim().toLowerCase().replace(/\.$/, '') !== expectedPtr.toLowerCase()) {
      out.push({ ip: a.ip, hostname: a.hostname, recordedPtr: a.ptr, expectedPtr, issue: 'ptr_mismatch' })
    }
  }
  return out
}
