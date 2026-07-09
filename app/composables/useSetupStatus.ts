export function useSetupStatus() {
  const setupRequired = useState<boolean | null>('setup_required', () => null)

  async function fetchSetupStatus() {
    try {
      const request = import.meta.server ? useRequestFetch() : $fetch
      const res = await request<{ required: boolean }>('/api/auth/setup-status')
      setupRequired.value = res.required
    } catch {
      // Fail open - a broken check shouldn't lock everyone out of login.
      setupRequired.value = false
    }
    return setupRequired.value
  }

  return { setupRequired, fetchSetupStatus }
}
