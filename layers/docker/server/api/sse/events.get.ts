import { createEventStream } from 'h3'
import { isNoisyDockerEvent, onDashboardPush, scheduleOverviewPush } from '~~/layers/docker/server/utils/dashboardSnapshot'
import { onResourcePush, dispatchDockerEvent } from '~~/layers/docker/server/utils/resourcePush'

// Broadcasts Docker daemon events to authenticated SSE clients, plus:
//  - the dashboard's server-computed overview/nodeUsage/metrics snapshots
//    (dashboardSnapshot.ts)
//  - every other page's server-computed list/detail snapshot (resourcePush.ts)
// both pushed as their own named events so pages never need to re-$fetch
// their REST endpoint after their first load.
// Falls back to heartbeat-only when Docker is unreachable.
export default defineEventHandler(async (event) => {
  await requireUser(event)

  const stream = createEventStream(event)
  let dockerStream: any = null

  const offDashboardPush = onDashboardPush(async (evt) => {
    try { await stream.push({ event: `dashboard-${evt.type}`, data: JSON.stringify(evt.data) }) } catch { /* client gone */ }
  })

  const offResourcePush = onResourcePush(async (evt) => {
    try {
      if (evt.kind === 'list') {
        await stream.push({ event: 'resource-list', data: JSON.stringify({ resource: evt.resource, data: evt.data }) })
      } else {
        await stream.push({ event: 'resource-detail', data: JSON.stringify({ resource: evt.resource, id: evt.id, data: evt.data }) })
      }
    } catch { /* client gone */ }
  })

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
                // Container healthchecks fire an exec every ~10s per
                // container - never a real state change, and forwarding them
                // just makes every listening page look like it's polling.
                if (isNoisyDockerEvent(evt.Type, evt.Action)) return

                await stream.push({
                  event: evt.Type ?? 'docker',
                  data: JSON.stringify({
                    type: evt.Type,
                    action: evt.Action,
                    name: evt.Actor?.Attributes?.name ?? evt.Actor?.ID ?? ''
                  })
                })

                if (['service', 'task', 'node', 'container'].includes(evt.Type)) scheduleOverviewPush()
                dispatchDockerEvent(evt)
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
    offDashboardPush()
    offResourcePush()
    try { dockerStream?.destroy?.() } catch { /* ignore */ }
  })

  return stream.send()
})
