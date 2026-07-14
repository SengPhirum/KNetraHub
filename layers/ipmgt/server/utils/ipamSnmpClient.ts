import snmp from 'net-snmp'

/**
 * SNMP v1/v2c/v3 client primitives for IPAM device discovery (system info +
 * ARP-table walk for IP/MAC discovery). A clean local implementation rather
 * than an import of Monitoring's netMonitor.ts (ipmgt and monitoring are
 * isolated siblings - see the Phase 1 architecture notes). Credentials are
 * always decrypted just-in-time by the caller and passed in; never logged,
 * never echoed back.
 */
export interface IpamSnmpOpts {
  community?: string
  version?: string // 'v1' | 'v2c' | 'v3'
  timeoutMs?: number
  retries?: number
  port?: number
  secLevel?: string
  authUser?: string
  authProtocol?: string
  authPassword?: string
  privProtocol?: string
  privPassword?: string
}

const OID = {
  sysDescr: '1.3.6.1.2.1.1.1.0',
  sysUpTime: '1.3.6.1.2.1.1.3.0',
  sysName: '1.3.6.1.2.1.1.5.0',
  ipNetToMediaPhysAddress: '1.3.6.1.2.1.4.22.1.2'
}

function buildV3User(opts: IpamSnmpOpts) {
  const level = (snmp.SecurityLevel as Record<string, number>)[opts.secLevel || 'authPriv'] ?? snmp.SecurityLevel.authPriv
  const user: Record<string, unknown> = { name: opts.authUser || '', level }
  if (level !== snmp.SecurityLevel.noAuthNoPriv) {
    user.authProtocol = (snmp.AuthProtocols as Record<string, number>)[opts.authProtocol || 'sha'] ?? snmp.AuthProtocols.sha
    user.authKey = opts.authPassword || ''
  }
  if (level === snmp.SecurityLevel.authPriv) {
    user.privProtocol = (snmp.PrivProtocols as Record<string, number>)[opts.privProtocol || 'des'] ?? snmp.PrivProtocols.des
    user.privKey = opts.privPassword || ''
  }
  return user
}

function createIpamSnmpSession(ip: string, opts: IpamSnmpOpts) {
  const base = { port: opts.port || 161, retries: opts.retries ?? 1, timeout: opts.timeoutMs ?? 2000 }
  if (opts.version === 'v3') return snmp.createV3Session(ip, buildV3User(opts), base)
  const version = opts.version === 'v1' ? snmp.Version1 : snmp.Version2c
  return snmp.createSession(ip, opts.community || 'public', { ...base, version })
}

function getVarbinds(session: ReturnType<typeof snmp.createSession>, oids: string[]): Promise<any[]> {
  return new Promise((resolve, reject) => {
    session.get(oids, (error: any, varbinds: any[]) => (error ? reject(error) : resolve(varbinds)))
  })
}

function walkColumn(session: ReturnType<typeof snmp.createSession>, baseOid: string): Promise<Map<string, any>> {
  return new Promise((resolve, reject) => {
    const out = new Map<string, any>()
    const feed = (varbinds: any[]) => {
      for (const vb of varbinds) {
        if (snmp.isVarbindError(vb)) continue
        out.set(String(vb.oid).slice(baseOid.length + 1), vb.value)
      }
    }
    session.subtree(baseOid, 20, feed, (error: any) => (error ? reject(error) : resolve(out)))
  })
}

function asString(v: any): string {
  if (v == null) return ''
  if (Buffer.isBuffer(v)) return v.toString('utf8').replace(/\0/g, '').trim()
  return String(v)
}

function macFromBuffer(v: any): string {
  if (!Buffer.isBuffer(v) || v.length === 0) return ''
  return Array.from(v).map((b: any) => b.toString(16).padStart(2, '0')).join(':')
}

export interface IpamSnmpSystem { sysName: string; sysDescr: string; uptimeTicks: number }

/** GET sysName/sysDescr/sysUpTime - throws on any failure (timeout, wrong creds, unreachable). */
export async function getIpamSnmpSystem(ip: string, opts: IpamSnmpOpts): Promise<IpamSnmpSystem> {
  const session = createIpamSnmpSession(ip, opts)
  try {
    const vbs = await getVarbinds(session, [OID.sysDescr, OID.sysUpTime, OID.sysName])
    if (!vbs?.length || snmp.isVarbindError(vbs[0])) throw new Error('No response or invalid credentials')
    return { sysDescr: asString(vbs[0]?.value), uptimeTicks: Number(vbs[1]?.value) || 0, sysName: asString(vbs[2]?.value) }
  } finally {
    try { session.close() } catch { /* ignore */ }
  }
}

/** Walk the device's ARP table (ipNetToMediaPhysAddress): IP -> MAC pairs it has learned. */
export async function getIpamSnmpArpTable(ip: string, opts: IpamSnmpOpts): Promise<{ ip: string; mac: string }[]> {
  const session = createIpamSnmpSession(ip, opts)
  try {
    const col = await walkColumn(session, OID.ipNetToMediaPhysAddress)
    const out: { ip: string; mac: string }[] = []
    for (const [suffix, value] of col) {
      // suffix = "<ifIndex>.<ip1>.<ip2>.<ip3>.<ip4>"
      const parts = suffix.split('.')
      if (parts.length < 5) continue
      const ipAddr = parts.slice(-4).join('.')
      const mac = macFromBuffer(value)
      if (mac && mac !== '00:00:00:00:00:00') out.push({ ip: ipAddr, mac })
    }
    return out
  } finally {
    try { session.close() } catch { /* ignore */ }
  }
}
