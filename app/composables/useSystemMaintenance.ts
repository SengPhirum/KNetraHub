// Shared system-maintenance state (Admin > System > Maintenance): the
// dismissible notification banner and the maintenance-mode lockout. Fetched
// by the default layout once the user is hydrated (and re-fetched after the
// admin page saves), shared via useState so layout and admin page agree.
export interface SystemMaintenanceState {
  banner: { enabled: boolean; message: string }
  maintenance: { enabled: boolean; title: string; subtitle: string; description: string }
}

export function useSystemMaintenance() {
  const state = useState<SystemMaintenanceState | null>('systemMaintenance', () => null)

  async function fetchState(): Promise<void> {
    try {
      state.value = await $fetch<SystemMaintenanceState>('/api/system/maintenance')
    } catch {
      // 401 before login / transient errors: leave whatever we had
    }
  }

  return { state, fetchState }
}
