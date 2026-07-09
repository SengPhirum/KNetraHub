export interface MonitoringEvent {
  type: 'net' | 'server' | 'trap'
}

// Subscribes to the SSE monitoring event stream and calls the handler for
// each event. Reconnects automatically with exponential back-off on
// error/close. Mirrors layers/docker's useDockerEvents.
export function useMonitoringEvents(handler: (event: MonitoringEvent) => void) {
  if (!import.meta.client) return { connected: ref(false) }

  const connected = ref(false)
  let es: EventSource | null = null
  let retryDelay = 3_000
  let retryTimer: ReturnType<typeof setTimeout>

  function connect() {
    es = new EventSource('/api/sse/monitoring')

    es.onopen = () => { connected.value = true; retryDelay = 3_000 }

    es.onmessage = (e) => {
      if (e.data === 'ping') return
      try { handler(JSON.parse(e.data)) } catch { /* ignore malformed */ }
    }

    for (const t of ['net', 'server', 'trap']) {
      es.addEventListener(t, (e) => {
        try { handler(JSON.parse((e as MessageEvent).data)) } catch { /* ignore */ }
      })
    }

    es.onerror = () => {
      connected.value = false
      es?.close()
      es = null
      retryTimer = setTimeout(() => {
        retryDelay = Math.min(retryDelay * 2, 30_000)
        connect()
      }, retryDelay)
    }
  }

  onMounted(connect)
  onUnmounted(() => {
    clearTimeout(retryTimer)
    es?.close()
    es = null
  })

  return { connected }
}
