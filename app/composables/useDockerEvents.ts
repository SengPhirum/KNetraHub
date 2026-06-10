export interface DockerEvent {
  type: string
  action: string
  name: string
}

// Subscribes to the SSE Docker event stream and calls the handler for each event.
// Reconnects automatically with exponential back-off on error/close.
export function useDockerEvents(handler: (event: DockerEvent) => void) {
  if (!import.meta.client) return { connected: ref(false) }

  const connected = ref(false)
  let es: EventSource | null = null
  let retryDelay = 3_000
  let retryTimer: ReturnType<typeof setTimeout>

  function connect() {
    es = new EventSource('/api/sse/events')

    es.onopen = () => { connected.value = true; retryDelay = 3_000 }

    es.onmessage = (e) => {
      if (e.data === 'ping') return
      try { handler(JSON.parse(e.data)) } catch { /* ignore malformed */ }
    }

    // Docker sends typed events (service, container, task, …)
    for (const t of ['service', 'container', 'task', 'node', 'network', 'volume', 'secret', 'config', 'stack']) {
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
