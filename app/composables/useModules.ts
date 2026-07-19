import type { ModuleDefinition, ModuleRuntimeState } from '../../shared/types/module'

export type RuntimeModule = ModuleDefinition & ModuleRuntimeState

export function useModules() {
  const modules = useState<RuntimeModule[]>('runtime_modules', () => [])
  const loaded = useState<boolean>('runtime_modules_loaded', () => false)
  const loading = useState<boolean>('runtime_modules_loading', () => false)

  async function fetchModules(force = false): Promise<RuntimeModule[]> {
    if (loaded.value && !force) return modules.value
    if (loading.value && !force) return modules.value
    loading.value = true
    try {
      const request = import.meta.server ? useRequestFetch() : $fetch
      const result = await request<{ modules: RuntimeModule[] }>('/api/modules')
      modules.value = result.modules || []
      loaded.value = true
      return modules.value
    } finally {
      loading.value = false
    }
  }

  const enabledModules = computed(() => modules.value.filter((module) => module.enabled && module.status === 'ready'))
  const isEnabled = (key: string) => enabledModules.value.some((module) => module.key === key)

  return { modules, enabledModules, loaded, loading, fetchModules, isEnabled }
}
