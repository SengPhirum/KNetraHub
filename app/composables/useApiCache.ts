/**
 * SPA-style data cache backed by useState.
 *
 * Key behaviour:
 *  - Data lives in a globally keyed useState ref → survives route changes.
 *  - status = 'pending'  only when there is NO cached data yet (shows skeleton).
 *  - status = 'success'  whenever data is present, even while a background
 *                        refresh is in-flight (no flash, no skeleton re-paint).
 *  - refreshing = true   during a background refresh (bind to refresh button).
 *  - Background errors are silently swallowed; only first-load errors surface.
 */
export function useApiCache<T>(key: string, fetcher: () => Promise<T>) {
  const data = useState<T | null>(`$cache:${key}`, () => null)
  const pending = ref(false)
  const error = ref<any>(null)

  const status = computed<'idle' | 'pending' | 'success' | 'error'>(() => {
    if (pending.value && data.value === null) return 'pending'
    if (error.value && data.value === null) return 'error'
    if (data.value !== null) return 'success'
    return 'idle'
  })

  // true while a background refresh runs (data already showing — no skeleton)
  const refreshing = computed(() => pending.value && data.value !== null)

  async function refresh() {
    pending.value = true
    error.value = null
    try {
      data.value = await fetcher()
    } catch (e) {
      // Surface errors only on first load; swallow background errors silently
      if (data.value === null) error.value = e
    } finally {
      pending.value = false
    }
  }

  return { data, status, error, refreshing, refresh }
}
