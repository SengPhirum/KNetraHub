import dgram from 'node:dgram'
import net from 'node:net'
import { getDb } from '~~/server/utils/db'
import { parseSyslog, type ParsedSyslog } from './syslogParser'

/**
 * Syslog receiver: RFC 3164 + RFC 5424 over UDP and TCP (newline-framed).
 * Messages are parsed (see syslogParser.ts), associated with a known device
 * by source IP/hostname, and stored in the monitoring.syslog hypertable.
 * Ingestion statistics are kept in memory and exposed via the API for the
 * health page.
 */
export { parseSyslog, type ParsedSyslog }

export const syslogStats = {
  received: 0,
  parsed: 0,
  parseFailures: 0,
  unknownDevices: 0,
  dropped: 0,
  lastMessageAt: null as string | null
}

let udpServer: dgram.Socket | null = null
let tcpServer: net.Server | null = null
const deviceCache = new Map<string, { id: number | null; at: number }>()

async function resolveDevice(sourceIp: string, hostname: string | null): Promise<number | null> {
  const key = `${sourceIp}|${hostname ?? ''}`
  const cached = deviceCache.get(key)
  if (cached && Date.now() - cached.at < 60000) return cached.id
  const db = getDb()
  const res = await db.query(
    `SELECT id FROM monitoring.devices
     WHERE ip = $1::inet OR lower(hostname) = lower($2) OR lower(sys_name) = lower($2)
        OR lower(hostname) = lower($3) OR lower(sys_name) = lower($3)
     LIMIT 1`,
    [sourceIp, hostname ?? sourceIp, (hostname ?? '').split('.')[0] || sourceIp]
  )
  const id = res.rows[0]?.id ?? null
  deviceCache.set(key, { id, at: Date.now() })
  return id
}

async function ingest(raw: string, sourceIp: string): Promise<void> {
  syslogStats.received++
  syslogStats.lastMessageAt = new Date().toISOString()
  if (raw.length > 16384) {
    syslogStats.dropped++
    return
  }
  const parsed = parseSyslog(raw)
  if (parsed.rfc === 'raw') syslogStats.parseFailures++
  else syslogStats.parsed++

  const deviceId = await resolveDevice(sourceIp, parsed.hostname)
  if (deviceId == null) syslogStats.unknownDevices++

  const db = getDb()
  await db.query(
    `INSERT INTO monitoring.syslog (device_id, source_ip, facility, severity, hostname, app_name, proc_id, msg_id, message, structured_data, rfc)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [deviceId, sourceIp, parsed.facility, parsed.severity, parsed.hostname, parsed.appName,
      parsed.procId, parsed.msgId, parsed.message.slice(0, 8000),
      parsed.structuredData ? JSON.stringify(parsed.structuredData) : null, parsed.rfc]
  ).catch((err) => {
    syslogStats.dropped++
    console.error('[monitoring:syslog] insert failed', err?.message)
  })
}

export function startSyslogReceiver(): void {
  const rc = useRuntimeConfig().monitoring as Record<string, any>
  if (!rc.syslogEnabled) return
  const port = Number(rc.syslogPort ?? 1514)
  const address = String(rc.syslogBindAddress ?? '0.0.0.0')

  udpServer = dgram.createSocket('udp4')
  udpServer.on('message', (msg, rinfo) => void ingest(msg.toString('utf8'), rinfo.address))
  udpServer.on('error', (err) => console.error('[monitoring:syslog] udp error', err))
  udpServer.bind(port, address, () => console.log(`[monitoring] syslog receiver listening on udp/${address}:${port}`))

  tcpServer = net.createServer((socket) => {
    let buffer = ''
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8')
      let idx: number
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim()
        buffer = buffer.slice(idx + 1)
        if (line) void ingest(line, socket.remoteAddress?.replace(/^::ffff:/, '') ?? '0.0.0.0')
      }
      if (buffer.length > 65536) buffer = '' // runaway line guard
    })
    socket.on('error', () => {})
  })
  tcpServer.on('error', (err) => console.error('[monitoring:syslog] tcp error', err))
  tcpServer.listen(port, address, () => console.log(`[monitoring] syslog receiver listening on tcp/${address}:${port}`))
}

export function stopSyslogReceiver(): void {
  try { udpServer?.close() } catch { /* closed */ }
  try { tcpServer?.close() } catch { /* closed */ }
  udpServer = null
  tcpServer = null
}
