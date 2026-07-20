/**
 * Portal security password state (the second secret required to confirm
 * critical deletes across every sub-app). Shared via useState so the layout's
 * post-login set-up prompt and any other surface stay in sync.
 *
 * `configured` is a tri-state: null = not yet checked, false = must set one up
 * (drives the mandatory prompt), true = ready.
 */
export function useSecurityPassword() {
  const configured = useState<boolean | null>('security_password_configured', () => null)
  const promptOpen = useState<boolean>('security_password_prompt_open', () => false)

  async function fetchStatus() {
    try {
      const { configured: c } = await $fetch<{ configured: boolean }>('/api/user/security-password')
      configured.value = c
      return c
    } catch {
      // Leave unknown on error rather than forcing a prompt on a transient hiccup.
      return configured.value
    }
  }

  /** Set or change the security password. Throws on validation/verify failure so
   *  callers can surface the message. */
  async function save(input: { current?: string; password: string; confirm: string }) {
    await $fetch('/api/user/security-password', { method: 'POST', body: input })
    configured.value = true
    promptOpen.value = false
  }

  return { configured, promptOpen, fetchStatus, save }
}
