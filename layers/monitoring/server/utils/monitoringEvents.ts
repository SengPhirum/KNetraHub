import { EventEmitter } from 'node:events'

/**
 * In-process pub/sub broadcasting monitoring data changes to connected SSE
 * clients (see server/api/sse/events.get.ts) - replaces per-page setInterval
 * polling with a push from the source of truth (netPoller/serverPoller/trap
 * receiver) the instant a cycle finishes, instead of clients blindly
 * refetching on a timer regardless of whether anything actually changed.
 */
export type MonitoringEventType = 'net' | 'server' | 'trap'

const bus = new EventEmitter()
// Default of 10 listeners would warn once more than 10 browser tabs/SSE
// connections are open at once - each is a legitimate listener, not a leak.
bus.setMaxListeners(200)

export function emitMonitoringEvent(type: MonitoringEventType) {
  bus.emit('event', { type })
}

export function onMonitoringEvent(handler: (evt: { type: MonitoringEventType }) => void) {
  bus.on('event', handler)
  return () => bus.off('event', handler)
}
