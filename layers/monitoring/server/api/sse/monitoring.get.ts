import { createEventStream } from 'h3'
import { onMonitoringEvent } from '~~/layers/monitoring/server/utils/monitoringEvents'

// Broadcasts netPoller/serverPoller/trap-receiver activity to authenticated
// clients, so pages can refetch the instant something actually changed
// instead of polling on a fixed timer. Mirrors layers/docker's own SSE
// endpoint (server/api/sse/events.get.ts).
export default defineEventHandler(async (event) => {
  await requireUser(event)

  const stream = createEventStream(event)

  const heartbeat = setInterval(async () => {
    try { await stream.push({ data: 'ping' }) } catch { /* client gone */ }
  }, 25_000)

  const unsubscribe = onMonitoringEvent(async (evt) => {
    try {
      await stream.push({ event: evt.type, data: JSON.stringify(evt) })
    } catch { /* client gone */ }
  })

  stream.onClosed(() => {
    clearInterval(heartbeat)
    unsubscribe()
  })

  return stream.send()
})
