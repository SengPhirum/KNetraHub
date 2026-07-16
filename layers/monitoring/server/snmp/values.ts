import snmp from 'net-snmp'

/**
 * SNMP varbind value conversion. net-snmp returns typed raw values (Buffers
 * for OctetString/Counter64, numbers for integers). Collection code needs
 * consistent JS values plus the raw type for the audit trail.
 */
export interface SnmpValue {
  /** Numeric net-snmp ObjectType code. */
  type: number
  typeName: string
  /** Converted JS value: string, number, or bigint (Counter64). */
  value: string | number | bigint | null
  /** Raw hex for buffers, for the diagnostic/raw-capture mode. */
  rawHex?: string
}

const TYPE_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(snmp.ObjectType as Record<string, number | string>)
    .filter(([, v]) => typeof v === 'number')
    .map(([k, v]) => [v as number, k])
)

export function typeName(type: number): string {
  return TYPE_NAMES[type] ?? `type${type}`
}

/** Counter64 arrives as an up-to-8-byte big-endian Buffer. */
export function counter64ToBigInt(buf: Buffer): bigint {
  let out = 0n
  for (const byte of buf) out = (out << 8n) | BigInt(byte)
  return out
}

/** Render a MAC-style OctetString ("aa:bb:cc:dd:ee:ff"). */
export function bufferToMac(buf: Buffer): string {
  return Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join(':')
}

/** True when an OctetString buffer looks like printable text. */
function isPrintable(buf: Buffer): boolean {
  for (const b of buf) {
    if (b === 0) continue
    if (b < 0x09 || (b > 0x0d && b < 0x20) || b > 0x7e) return false
  }
  return true
}

/**
 * Convert one net-snmp varbind into a SnmpValue. `hint` steers OctetString
 * decoding for columns known to be binary (MACs) — everything else decodes
 * printable buffers as UTF-8 and falls back to hex.
 */
export function convertVarbind(vb: { type: number; value: any }, hint?: 'mac' | 'hex' | 'text'): SnmpValue {
  const t = vb.type
  const base: SnmpValue = { type: t, typeName: typeName(t), value: null }

  if (vb.value == null) return base

  switch (t) {
    case snmp.ObjectType.OctetString: {
      const buf: Buffer = Buffer.isBuffer(vb.value) ? vb.value : Buffer.from(String(vb.value))
      base.rawHex = buf.toString('hex')
      if (hint === 'mac') base.value = bufferToMac(buf)
      else if (hint === 'hex') base.value = buf.toString('hex')
      else if (isPrintable(buf)) base.value = buf.toString('utf8').replace(/\0+$/g, '').trim()
      else base.value = buf.toString('hex')
      return base
    }
    case snmp.ObjectType.Counter64: {
      const buf: Buffer = Buffer.isBuffer(vb.value) ? vb.value : Buffer.alloc(0)
      base.rawHex = buf.toString('hex')
      base.value = counter64ToBigInt(buf)
      return base
    }
    case snmp.ObjectType.OID:
      base.value = String(vb.value)
      return base
    case snmp.ObjectType.IpAddress:
      base.value = String(vb.value)
      return base
    case snmp.ObjectType.TimeTicks:
    case snmp.ObjectType.Counter:
    case snmp.ObjectType.Gauge:
    case snmp.ObjectType.Integer:
    case snmp.ObjectType.Unsigned32:
      base.value = Number(vb.value)
      return base
    default:
      base.value = Buffer.isBuffer(vb.value) ? vb.value.toString('hex') : (vb.value as any)
      return base
  }
}

/** Numeric coercion for metric persistence (bigint → number with clamp). */
export function toNumber(v: SnmpValue | null | undefined): number | null {
  if (!v || v.value == null) return null
  if (typeof v.value === 'number') return Number.isFinite(v.value) ? v.value : null
  if (typeof v.value === 'bigint') return Number(v.value)
  const n = Number(v.value)
  return Number.isFinite(n) ? n : null
}

/** BigInt coercion for counter math (safe for Counter32 + Counter64). */
export function toBigInt(v: SnmpValue | null | undefined): bigint | null {
  if (!v || v.value == null) return null
  if (typeof v.value === 'bigint') return v.value
  if (typeof v.value === 'number' && Number.isFinite(v.value)) return BigInt(Math.trunc(v.value))
  try {
    return BigInt(String(v.value))
  } catch {
    return null
  }
}

export function toStringValue(v: SnmpValue | null | undefined): string | null {
  if (!v || v.value == null) return null
  return String(v.value)
}
