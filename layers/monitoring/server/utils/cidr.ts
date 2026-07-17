/** Parse an IPv4 CIDR string like "10.0.0.0/24" into its base + prefix. */
export function parseIPv4Cidr(input: string): { base: string; prefix: number } | null {
  const m = String(input ?? '').trim().match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/)
  if (!m) return null
  const octets = m[1]!.split('.').map(Number)
  if (octets.some((o) => o < 0 || o > 255)) return null
  const prefix = Number(m[2])
  if (prefix < 0 || prefix > 32) return null
  return { base: m[1]!, prefix }
}

/** Enumerate usable IPv4 host addresses in a CIDR block (network/broadcast excluded except for /31, /32). */
export function enumerateIPv4Hosts(baseIp: string, prefix: number): string[] {
  const base = baseIp.split('.').map(Number)
  const baseInt = ((base[0]! << 24) | (base[1]! << 16) | (base[2]! << 8) | base[3]!) >>> 0
  const hostBits = 32 - prefix
  const size = 1 << hostBits
  const network = baseInt & (~((size - 1) >>> 0) >>> 0)
  const out: string[] = []
  const first = prefix >= 31 ? 0 : 1
  const last = prefix >= 31 ? size - 1 : size - 2
  for (let i = first; i <= last; i++) {
    const ip = (network + i) >>> 0
    out.push([(ip >>> 24) & 255, (ip >>> 16) & 255, (ip >>> 8) & 255, ip & 255].join('.'))
  }
  return out
}
