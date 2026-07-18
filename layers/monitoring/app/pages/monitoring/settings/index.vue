<script setup lang="ts">
// Monitoring settings (admin tier): DB-backed runtime settings (override
// NUXT_MONITORING_* env without restart, effective within ~30s) + global
// discovery/poll module toggles + links to the other admin surfaces.
const { hasMonitoring, canManage } = useMonitoring()
const toast = useToast()

const { data: settingsData, refresh: refreshSettings } = useAsyncData('monSettings',
  () => $fetch<any>('/api/monitoring/v1/settings'),
  { server: false, default: () => ({ items: [] }) })

const edited = reactive<Record<string, string>>({})
watch(() => settingsData.value?.items, (items) => {
  for (const s of items ?? []) edited[s.key] = String(s.value)
}, { immediate: true })

const savingSettings = ref(false)
async function saveSettings() {
  savingSettings.value = true
  try {
    const values: Record<string, number> = {}
    for (const s of settingsData.value?.items ?? []) {
      const v = Number(edited[s.key])
      if (Number.isFinite(v) && v !== s.value) values[s.key] = v
    }
    if (!Object.keys(values).length) {
      toast.add({ title: 'Nothing changed', color: 'neutral' })
      return
    }
    await $fetch('/api/monitoring/v1/settings', { method: 'PUT', body: { values } })
    toast.add({ title: 'Settings saved', description: 'Effective within ~30 seconds.', color: 'primary', icon: 'i-lucide-check' })
    await refreshSettings()
  } catch (e: any) {
    toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' })
  } finally { savingSettings.value = false }
}

async function resetSetting(key: string) {
  try {
    await $fetch('/api/monitoring/v1/settings', { method: 'PUT', body: { values: { [key]: null } } })
    toast.add({ title: 'Reverted to default', color: 'primary', icon: 'i-lucide-check' })
    await refreshSettings()
  } catch (e: any) {
    toast.add({ title: 'Revert failed', description: e?.data?.statusMessage, color: 'error' })
  }
}

// ── Global module toggles ──
const { data: modulesData, refresh: refreshModules } = useAsyncData('monModuleSettings',
  () => $fetch<any>('/api/monitoring/v1/module-settings?scope=global'),
  { server: false, default: () => ({ modules: { discovery: [], poll: [] }, overrides: [] }) })

function effectiveEnabled(phase: 'discovery' | 'poll', mod: any): boolean {
  const ov = (modulesData.value?.overrides ?? []).find((o: any) => o.phase === phase && o.module === mod.name)
  return ov ? !!ov.enabled : !!mod.default_enabled
}
function overridden(phase: 'discovery' | 'poll', mod: any): boolean {
  return (modulesData.value?.overrides ?? []).some((o: any) => o.phase === phase && o.module === mod.name)
}
async function toggleModule(phase: 'discovery' | 'poll', mod: any) {
  const next = !effectiveEnabled(phase, mod)
  try {
    await $fetch('/api/monitoring/v1/module-settings', {
      method: 'PUT',
      body: { changes: [{ scope: 'global', phase, module: mod.name, enabled: next === !!mod.default_enabled ? null : next }] }
    })
    await refreshModules()
  } catch (e: any) {
    toast.add({ title: 'Update failed', description: e?.data?.statusMessage, color: 'error' })
  }
}

const receiverRows = [
  ['Trap receiver', 'NUXT_MONITORING_TRAP_ENABLED / _PORT', 'off by default; UDP 1162'],
  ['Syslog receiver', 'NUXT_MONITORING_SYSLOG_ENABLED / _PORT', 'off by default; UDP+TCP 1514'],
  ['Dispatcher', 'NUXT_MONITORING_DISPATCHER_ENABLED', 'per-node; false = UI/API only'],
  ['Poller name / group', 'NUXT_MONITORING_POLLER_NAME / _POLLER_GROUP', 'node identity — restart required'],
  ['Worker concurrency', 'NUXT_MONITORING_WORKER_CONCURRENCY', '16 concurrent jobs per node — restart required']
]
</script>

<template>
  <div>
    <PageHeader title="Settings" subtitle="Monitoring runtime configuration" icon="i-lucide-settings" />
    <div v-if="!hasMonitoring || !canManage" class="panel p-10 text-center text-muted">Requires the Monitoring admin tier.</div>
    <div v-else class="space-y-6">
      <div class="panel p-4">
        <div class="mb-3 flex items-center justify-between">
          <div>
            <h2 class="font-semibold">Runtime settings</h2>
            <p class="text-xs text-muted">Stored in the database; override the NUXT_MONITORING_* env defaults without a restart (effective within ~30s).</p>
          </div>
          <UButton size="sm" icon="i-lucide-save" :loading="savingSettings" @click="saveSettings">Save changes</UButton>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-surface-2 text-left text-xs uppercase text-faint">
              <tr><th class="px-3 py-2">Setting</th><th class="px-3 py-2">Value</th><th class="px-3 py-2">Unit</th>
                <th class="px-3 py-2">Source</th><th class="px-3 py-2">Description</th><th class="px-3 py-2" /></tr>
            </thead>
            <tbody>
              <tr v-for="s in settingsData.items" :key="s.key" class="border-t border-hull">
                <td class="px-3 py-2 whitespace-nowrap">{{ s.label }}</td>
                <td class="px-3 py-2"><UInput v-model="edited[s.key]" type="number" size="xs" class="w-28" :min="s.min" :max="s.max" /></td>
                <td class="px-3 py-2 text-muted">{{ s.unit }}</td>
                <td class="px-3 py-2">
                  <span :class="s.source === 'db' ? 'text-sky-400' : 'text-faint'">{{ s.source === 'db' ? 'override' : s.source }}</span>
                </td>
                <td class="px-3 py-2 text-xs text-muted">{{ s.description }}</td>
                <td class="px-3 py-2 text-right">
                  <UButton v-if="s.source === 'db'" size="xs" variant="ghost" icon="i-lucide-rotate-ccw" title="Revert to default" @click="resetSetting(s.key)" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="grid gap-6 lg:grid-cols-2">
        <div v-for="phase in ['discovery', 'poll']" :key="phase" class="panel p-4">
          <h2 class="mb-1 font-semibold capitalize">{{ phase }} modules</h2>
          <p class="mb-3 text-xs text-muted">Global defaults — per-device and per-group overrides are set on the device's Settings tab.</p>
          <div class="space-y-1.5">
            <div v-for="m in modulesData.modules[phase]" :key="m.name" class="flex items-center justify-between rounded px-2 py-1.5 hover:bg-surface-2/60">
              <div class="flex items-center gap-2">
                <span class="text-sm">{{ m.name }}</span>
                <span v-if="m.requires_snmp" class="rounded bg-surface-2 px-1 py-0.5 text-[10px] uppercase text-faint">snmp</span>
                <span v-if="overridden(phase, m)" class="rounded bg-sky-500/10 px-1 py-0.5 text-[10px] uppercase text-sky-400">override</span>
              </div>
              <UButton size="xs" :variant="effectiveEnabled(phase, m) ? 'soft' : 'ghost'"
                :color="effectiveEnabled(phase, m) ? 'primary' : 'neutral'" @click="toggleModule(phase, m)">
                {{ effectiveEnabled(phase, m) ? 'Enabled' : 'Disabled' }}
              </UButton>
            </div>
          </div>
        </div>
      </div>

      <div class="panel overflow-x-auto">
        <div class="border-b border-hull px-4 py-3">
          <h2 class="font-semibold">Node / receiver configuration (env only)</h2>
          <p class="text-xs text-muted">These identify the node or bind sockets — set per deployment, restart required.</p>
        </div>
        <table class="w-full text-sm">
          <tbody>
            <tr v-for="r in receiverRows" :key="r[0]" class="border-t border-hull first:border-t-0">
              <td class="px-4 py-2">{{ r[0] }}</td>
              <td class="px-4 py-2 font-mono text-xs">{{ r[1] }}</td>
              <td class="px-4 py-2 text-muted">{{ r[2] }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="grid gap-4 sm:grid-cols-4">
        <NuxtLink to="/monitoring/settings/credentials" class="panel p-4 hover:ring-1 hover:ring-primary/40"><h3 class="font-semibold">SNMP Credentials</h3><p class="text-sm text-muted">Community/v3 sets tried during discovery</p></NuxtLink>
        <NuxtLink to="/monitoring/alerts/rules" class="panel p-4 hover:ring-1 hover:ring-primary/40"><h3 class="font-semibold">Alert rules</h3><p class="text-sm text-muted">Rule conditions, delays, scoping</p></NuxtLink>
        <NuxtLink to="/monitoring/alerts/transports" class="panel p-4 hover:ring-1 hover:ring-primary/40"><h3 class="font-semibold">Transports</h3><p class="text-sm text-muted">Delivery channels + test</p></NuxtLink>
        <NuxtLink to="/monitoring/pollers" class="panel p-4 hover:ring-1 hover:ring-primary/40"><h3 class="font-semibold">Pollers</h3><p class="text-sm text-muted">Nodes, queue, dead-letter</p></NuxtLink>
      </div>
    </div>
  </div>
</template>
