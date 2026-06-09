import { requireUser } from '~~/server/utils/auth'
import { useDocker } from '~~/server/utils/docker'
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const q = getQuery(event)
  const tail = Number(q.tail) || 200
  const docker = useDocker()
  const buf = (await docker.getService(id).logs({
    stdout: true, stderr: true, tail, timestamps: true, follow: false
  })) as unknown as Buffer
  return { logs: demux(buf) }
})

// Docker multiplexes stdout/stderr with an 8-byte header per frame when no TTY.
function demux(buf: Buffer): string {
  const lines: string[] = []
  let i = 0
  while (i < buf.length) {
    if (i + 8 > buf.length) break
    const len = buf.readUInt32BE(i + 4)
    const text = buf.toString('utf8', i + 8, i + 8 + len)
    lines.push(text)
    i += 8 + len
  }
  const out = lines.join('')
  // fall back to raw if it didn't look multiplexed
  return out.trim().length ? out : buf.toString('utf8')
}
