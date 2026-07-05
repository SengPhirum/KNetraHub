// Shared, deduped data source for net dashboard widgets. Multiple widgets that
// need the same endpoint pass the same key, so Nuxt's useAsyncData fetches it
// once; the dashboard page triggers a global refresh via refreshNuxtData().
export function useNetData<T = any>(key: string, url: string) {
  const { data } = useAsyncData<T[]>(key, () => $fetch(url), { default: () => [] as T[] })
  return data
}
