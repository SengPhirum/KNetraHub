interface UserNotificationEvent {
  id: string
  title: string
  message: string
  severity: 'critical' | 'warning' | 'info'
  firedAt: string
}

export function useUserNotifications() {
  const { user } = useAuth()
  const { prefs } = usePreferences()
  const toast = useToast()
  const cursor = ref('')
  const seen = new Set<string>()
  let timer: ReturnType<typeof setInterval> | undefined
  let running = false

  function showToast(event: UserNotificationEvent) {
    toast.add({
      title: event.title,
      description: event.message,
      icon: event.severity === 'critical' ? 'i-lucide-circle-alert' : 'i-lucide-bell',
      color: event.severity === 'critical' ? 'error' : event.severity === 'warning' ? 'warning' : 'info'
    })
  }

  function deliver(event: UserNotificationEvent) {
    const browserEnabled = prefs.value.notifications.delivery === 'browser'
    if (browserEnabled && 'Notification' in window && Notification.permission === 'granted') {
      const notification = new Notification(event.title, {
        body: event.message,
        icon: '/icons/icon-192x192.png',
        tag: event.id
      })
      notification.onclick = () => {
        window.focus()
        notification.close()
      }
      return
    }
    showToast(event)
  }

  async function poll(baseline = false) {
    if (!user.value || running) return
    running = true
    try {
      const data = await $fetch<{ events: UserNotificationEvent[]; serverTime: string }>('/api/user/notifications', {
        query: baseline ? { baseline: '1' } : { since: cursor.value }
      })
      if (!baseline) {
        for (const event of data.events) {
          if (seen.has(event.id)) continue
          seen.add(event.id)
          deliver(event)
        }
      }
      cursor.value = data.serverTime
    } catch {
      // A transient polling/session error should not interrupt the application.
    } finally {
      running = false
    }
  }

  async function start() {
    if (!import.meta.client || !user.value || timer) return
    await poll(true)

    if (prefs.value.notifications.delivery === 'browser' && 'Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission().catch(() => 'default')
    }

    timer = setInterval(() => poll(), 10_000)
  }

  function stop() {
    if (timer) clearInterval(timer)
    timer = undefined
    cursor.value = ''
    seen.clear()
  }

  onBeforeUnmount(stop)
  return { start, stop, poll }
}
