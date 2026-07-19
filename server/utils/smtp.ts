import { randomBytes } from 'node:crypto'
import type { Socket } from 'node:net'

/**
 * A minimal SMTP client on node:net / node:tls - no new dependency, matching
 * the approach already taken by the monitoring alert transports. Supports
 * plain, STARTTLS and implicit TLS (SMTPS), AUTH PLAIN/LOGIN, and
 * multipart/alternative bodies.
 *
 * Deliberately free of settings/database imports: everything it needs arrives
 * as arguments, which keeps the protocol layer independently testable against
 * a fake SMTP server. Delivery policy (what to send, to whom, and when) lives
 * in mailer.ts.
 */

export const SMTP_TIMEOUT_MS = 15_000

export interface SmtpConfig {
  host: string
  port: number
  encryption: 'none' | 'starttls' | 'ssl'
  username: string
  password: string
  fromAddress: string
  fromName: string
  replyTo: string
  /** Accept self-signed / mismatched certs. Internal relays only. */
  allowInsecureTls: boolean
}

export interface SmtpMessage {
  to: string[]
  subject: string
  html: string
  text: string
}

export interface SmtpResult {
  ok: boolean
  error?: string
  /** The SMTP conversation, transcript-style, for troubleshooting a failure. */
  transcript: string[]
}

export async function sendSmtpMessage(config: SmtpConfig, message: SmtpMessage): Promise<SmtpResult> {
  const transcript: string[] = []
  let socket: Socket | null = null

  try {
    const net = await import('node:net')
    const tls = await import('node:tls')

    socket = config.encryption === 'ssl' ? await connectTls(tls, config) : await connectPlain(net, config)

    const conn = createConnection(socket, transcript)

    await conn.expect(220)
    let ehlo = await conn.command('EHLO knetrahub', 250)

    if (config.encryption === 'starttls') {
      await conn.command('STARTTLS', 220)
      socket = await upgradeTls(tls, socket, config)
      conn.rebind(socket)
      // RFC 3207: the EHLO must be repeated over the encrypted channel, and
      // the server may only advertise AUTH after the upgrade.
      ehlo = await conn.command('EHLO knetrahub', 250)
    }

    if (config.username) await authenticate(conn, config, ehlo)

    await conn.command(`MAIL FROM:<${config.fromAddress}>`, 250)
    for (const rcpt of message.to) await conn.command(`RCPT TO:<${rcpt}>`, 250)
    await conn.command('DATA', 354)
    await conn.sendData(buildMessage(config, message))

    try {
      await conn.command('QUIT', 221)
    } catch {
      // A server closing the socket on QUIT is common and harmless - the
      // message was already accepted by the 250 after DATA.
    }

    return { ok: true, transcript }
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err), transcript }
  } finally {
    try { socket?.destroy() } catch { /* already gone */ }
  }
}

// ─── connection ───────────────────────────────────────────────────────────────

function connectPlain(net: typeof import('node:net'), c: SmtpConfig): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: c.host, port: c.port })
    socket.setTimeout(SMTP_TIMEOUT_MS)
    socket.once('connect', () => resolve(socket))
    socket.once('error', reject)
    socket.once('timeout', () => reject(new Error(`Timed out connecting to ${c.host}:${c.port}`)))
  })
}

function connectTls(tls: typeof import('node:tls'), c: SmtpConfig): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: c.host,
      port: c.port,
      servername: c.host,
      rejectUnauthorized: !c.allowInsecureTls
    })
    socket.setTimeout(SMTP_TIMEOUT_MS)
    socket.once('secureConnect', () => resolve(socket))
    socket.once('error', reject)
    socket.once('timeout', () => reject(new Error(`Timed out connecting to ${c.host}:${c.port}`)))
  })
}

function upgradeTls(tls: typeof import('node:tls'), socket: Socket, c: SmtpConfig): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const secure = tls.connect({ socket, servername: c.host, rejectUnauthorized: !c.allowInsecureTls })
    secure.setTimeout(SMTP_TIMEOUT_MS)
    secure.once('secureConnect', () => resolve(secure))
    secure.once('error', reject)
    secure.once('timeout', () => reject(new Error('Timed out negotiating STARTTLS')))
  })
}

/**
 * Line-buffered SMTP conversation. A reply can span several lines
 * ("250-PIPELINING" … "250 HELP") and can arrive split across TCP chunks, so
 * replies are accumulated until a final line ("NNN " with a space) lands -
 * reading one 'data' event per command silently mis-pairs replies.
 */
function createConnection(initial: Socket, transcript: string[]) {
  let socket = initial
  let buffer = ''
  let pending: { resolve: (r: string) => void; reject: (e: Error) => void } | null = null

  const onData = (chunk: Buffer) => {
    buffer += chunk.toString('utf8')
    // A complete reply ends with a line whose code is followed by a space.
    const match = /^\d{3} [^\n]*\n/m.exec(buffer)
    if (!match) return
    const endIndex = (match.index ?? 0) + match[0].length
    const reply = buffer.slice(0, endIndex)
    buffer = buffer.slice(endIndex)
    transcript.push(`← ${reply.trim()}`)
    const waiter = pending
    pending = null
    waiter?.resolve(reply)
  }

  const onError = (err: Error) => {
    const waiter = pending
    pending = null
    waiter?.reject(err)
  }

  const bind = (s: Socket) => {
    socket = s
    s.on('data', onData)
    s.on('error', onError)
    s.on('timeout', () => onError(new Error('SMTP timeout')))
  }
  bind(initial)

  const read = (): Promise<string> =>
    new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout>
      pending = {
        resolve: (r) => { clearTimeout(timer); resolve(r) },
        reject: (e) => { clearTimeout(timer); reject(e) }
      }
      timer = setTimeout(() => onError(new Error('SMTP timeout waiting for reply')), SMTP_TIMEOUT_MS)
      // A complete reply may already be sitting in the buffer (the server
      // pipelined it with the previous one) - drain before waiting on 'data'.
      onData(Buffer.alloc(0))
    })

  const write = (line: string) => {
    // Never log credentials, even in a failure transcript.
    transcript.push(`→ ${/^AUTH|^[A-Za-z0-9+/=]{16,}$/.test(line) ? '<redacted>' : line}`)
    socket.write(line + '\r\n')
  }

  return {
    rebind: (s: Socket) => {
      buffer = ''
      bind(s)
    },
    async expect(code: number): Promise<string> {
      const reply = await read()
      assertCode(reply, code)
      return reply
    },
    async command(line: string, code?: number): Promise<string> {
      write(line)
      const reply = await read()
      if (code) assertCode(reply, code)
      return reply
    },
    /** Sends the message body, dot-stuffed, then waits for the 250. */
    async sendData(message: string): Promise<string> {
      // Normalise to CRLF, then escape any line that starts with a dot so it
      // can't be mistaken for the end-of-data marker (RFC 5321 §4.5.2).
      const stuffed = message.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n').replace(/\r\n\./g, '\r\n..')
      transcript.push(`→ <message: ${stuffed.length} bytes>`)
      socket.write(stuffed + '\r\n.\r\n')
      const reply = await read()
      assertCode(reply, 250)
      return reply
    }
  }
}

type Conn = ReturnType<typeof createConnection>

function assertCode(reply: string, expected: number) {
  const code = Number(reply.slice(0, 3))
  if (code !== expected) {
    throw new Error(`SMTP expected ${expected} but got: ${reply.trim().split('\n').pop()}`)
  }
}

async function authenticate(conn: Conn, c: SmtpConfig, ehlo: string) {
  const mechanisms = /AUTH[ =]([^\r\n]*)/i.exec(ehlo)?.[1]?.toUpperCase() ?? ''

  if (mechanisms.includes('PLAIN')) {
    const credential = Buffer.from(`\0${c.username}\0${c.password}`, 'utf8').toString('base64')
    await conn.command(`AUTH PLAIN ${credential}`, 235)
    return
  }

  // LOGIN is the fallback, and what most legacy relays advertise.
  await conn.command('AUTH LOGIN', 334)
  await conn.command(Buffer.from(c.username, 'utf8').toString('base64'), 334)
  await conn.command(Buffer.from(c.password, 'utf8').toString('base64'), 235)
}

// ─── message construction ─────────────────────────────────────────────────────

export function buildMessage(config: SmtpConfig, m: SmtpMessage): string {
  const boundary = `=_knetrahub_${randomBytes(12).toString('hex')}`
  const domain = config.fromAddress.split('@')[1] || 'knetrahub.local'

  const headers = [
    `From: ${formatAddress(config.fromAddress, config.fromName)}`,
    `To: ${m.to.join(', ')}`,
    ...(config.replyTo ? [`Reply-To: ${config.replyTo}`] : []),
    `Subject: ${encodeHeaderValue(m.subject)}`,
    `Message-ID: <${randomBytes(16).toString('hex')}@${domain}>`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`
  ]

  // base64 for both parts: sidesteps the 998-octet line limit and keeps
  // non-ASCII bodies intact on relays that aren't 8BITMIME-clean.
  const parts = [
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(m.text),
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(m.html),
    `--${boundary}--`
  ]

  return headers.join('\r\n') + '\r\n\r\n' + parts.join('\r\n')
}

function formatAddress(address: string, name: string): string {
  if (!name) return `<${address}>`
  return `${encodeHeaderValue(name, true)} <${address}>`
}

/** RFC 2047 encoded-word for non-ASCII headers; quoted when it's a display name. */
function encodeHeaderValue(value: string, isDisplayName = false): string {
  if (/^[\x20-\x7E]*$/.test(value)) {
    return isDisplayName && /[",;:<>@]/.test(value) ? `"${value.replace(/(["\\])/g, '\\$1')}"` : value
  }
  return `=?utf-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
}

function base64Lines(content: string): string {
  return (Buffer.from(content, 'utf8').toString('base64').match(/.{1,76}/g) ?? []).join('\r\n')
}
