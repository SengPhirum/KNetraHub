import { createEventStream } from 'h3'

// Broadcasts Docker daemon events to authenticated SSE clients.
// Falls back to heartbeat-only when Docker is unreachable.
export default defineEventHandler(async (event) => {
  await requireUser(event)

  const stream = createEventStream(event)
  let dockerStream: any = null

  // ── heartbeat ──────────────────────────────────────────────────────────────
  const heartbeat = setInterval(async () => {
    try { await stream.push({ data: 'ping' }) } catch { /* client gone */ }
  }, 25_000)

  // ── docker events ──────────────────────────────────────────────────────────
  async function attachDockerEvents() {
    try {
      const docker = useDocker()
      await new Promise<void>((resolve, reject) => {
        docker.getEvents(
          { since: Math.floor(Date.now() / 1000) },
          (err: Error | null, resp: any) => {
            if (err || !resp) { reject(err); return }
            dockerStream = resp

            resp.on('data', async (chunk: Buffer) => {
              try {
                const evt = JSON.parse(chunk.toString())
                await stream.push({
                  event: evt.Type ?? 'docker',
                  data: JSON.stringify({
                    type: evt.Type,
                    action: evt.Action,
                    name: evt.Actor?.Attributes?.name ?? evt.Actor?.ID ?? ''
                  })
                })
              } catch { /* ignore parse errors */ }
            })

            resp.on('error', () => {
              dockerStream = null
              setTimeout(attachDockerEvents, 8_000)
            })
            resp.on('end', () => {
              dockerStream = null
              setTimeout(attachDockerEvents, 8_000)
            })

            resolve()
          }
        )
      })
    } catch {
      // Docker not reachable — retry later; heartbeats keep the connection alive
      setTimeout(attachDockerEvents, 15_000)
    }
  }

  attachDockerEvents()

  // ── cleanup ────────────────────────────────────────────────────────────────
  stream.onClosed(() => {
    clearInterval(heartbeat)
    try { dockerStream?.destroy?.() } catch { /* ignore */ }
  })

  return stream.send()
})
