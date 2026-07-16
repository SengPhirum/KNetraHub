<script setup lang="ts">
// Device inventory: filter by status/OS/text, add device, open detail.
const { hasMonitoring, canManage, deviceStatusMeta, formatUptime } = useMonitoring()
const route = useRoute()
const toast = useToast()

const filters = reactive({
  status: (route.query.status as string) || '',
  os: '',
  q: ''
})
const page = ref(1)

const query = computed(() => {
  const p = new URLSearchParams()
  if (filters.status) p.set('status', filters.status)
  if (filters.os) p.set('os', filters.os)
  if (filters.q) p.set('q', filters.q)
  p.set('page', String(page.value))
  p.set('per_page', '50')
  return p.toString()
})

const { data, status, refresh } = useAsyncData('monDevices',
  () => $fetch<any>(`/api/monitoring/v1/devices?${query.value}`),
  { server: false, default: () => ({ items: [], total: 0 }), watch: [query] })

const statusItems = [
  { value: '', label: 'All statuses' }, { value: 'up', label: 'Up' }, { value: 'down', label: 'Down' },
  { value: 'degraded', label: 'Degraded' }, { value: 'maintenance', label: 'Maintenance' },
  { value: 'disabled', label: 'Disabled' }, { value: 'pending', label: 'Pending' }
]

const addOpen = ref(false)
const addForm = reactive({ hostname: '', ip: '', snmp_disabled: false, snmp_version: 'v2c', snmp_community: '' })
const adding = ref(false)
async function submitAdd() {
  adding.value = true
  try {
    await $fetch('/api/monitoring/v1/devices', { method: 'POST', body: { ...addForm } })
    toast.add({ title: 'Device added', description: 'Discovery queued.', color: 'primary', icon: 'i-lucide-check' })
    addOpen.value = false
    Object.assign(addForm, { hostname: '', ip: '', snmp_disabled: false, snmp_version: 'v2c', snmp_community: '' })
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Add failed', description: e?.data?.statusMessage, color: 'error' })
  } finally { adding.value = false }
}

const totalPages = computed(() => Math.max(1, Math.ceil((data.value?.total ?? 0) / 50)))
</script>

<template>
  <div>
    <PageHeader title="Devices" subtitle="Unified device inventory" icon="i-lucide-router">
      <template v-if="hasMonitoring && canManage" #actions>
        <UButton icon="i-lucide-plus" size="sm" @click="addOpen = true">Add device</UButton>
      </template>
    </PageHeader>

    <div v-if="!hasMonitoring" class="panel p-10 text-center text-muted">No access to the Monitoring app.</div>

    <div v-else class="space-y-4">
      <div class="flex flex-wrap items-center gap-2">
        <USelect v-model="filters.status" :items="statusItems" size="sm" class="w-44" />
        <UInput v-model="filters.q" placeholder="Search hostname / IP…" icon="i-lucide-search" size="sm" class="w-64" />
        <span class="ml-auto text-sm text-muted">{{ data?.total ?? 0 }} devices</span>
      </div>

      <div class="panel overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-surface-2 text-left text-xs uppercase tracking-wide text-faint">
            <tr>
              <th class="px-3 py-2">Status</th><th class="px-3 py-2">Hostname</th>
              <th class="px-3 py-2">IP</th><th class="px-3 py-2">OS</th>
              <th class="px-3 py-2 text-right">Uptime</th><th class="px-3 py-2 text-right">Ports</th>
              <th class="px-3 py-2 text-right">Sensors</th><th class="px-3 py-2 text-right">Alerts</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="status === 'pending'"><td colspan="8" class="px-3 py-8 text-center text-muted">Loading…</td></tr>
            <tr v-else-if="!data?.items?.length"><td colspan="8" class="px-3 py-8 text-center text-muted">No devices. Add one to begin.</td></tr>
            <tr v-for="d in data.items" :key="d.id" class="border-t border-hull hover:bg-surface-2/50">
              <td class="px-3 py-2">
                <span :class="['inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs', deviceStatusMeta(d.status).badge]">
                  <span :class="['h-1.5 w-1.5 rounded-full', deviceStatusMeta(d.status).dot]" />
                  {{ deviceStatusMeta(d.status).label }}
                </span>
              </td>
              <td class="px-3 py-2">
                <NuxtLink :to="`/monitoring/devices/${d.id}`" class="font-medium text-primary hover:underline">
                  {{ d.display_name || d.hostname }}
                </NuxtLink>
                <div v-if="d.display_name" class="text-xs text-faint">{{ d.hostname }}</div>
              </td>
              <td class="px-3 py-2 font-mono text-xs">{{ d.ip || '—' }}</td>
              <td class="px-3 py-2">{{ d.os }}<span v-if="d.os_version" class="text-faint"> {{ d.os_version }}</span></td>
              <td class="px-3 py-2 text-right text-muted">{{ formatUptime(d.uptime_seconds) }}</td>
              <td class="px-3 py-2 text-right">{{ d.port_count }}</td>
              <td class="px-3 py-2 text-right">{{ d.sensor_count }}</td>
              <td class="px-3 py-2 text-right">
                <span v-if="d.active_alerts > 0" class="rounded bg-rose-500/10 px-1.5 py-0.5 text-xs text-rose-400">{{ d.active_alerts }}</span>
                <span v-else class="text-faint">0</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="totalPages > 1" class="flex items-center justify-center gap-2">
        <UButton size="xs" :disabled="page <= 1" @click="page--">Prev</UButton>
        <span class="text-sm text-muted">{{ page }} / {{ totalPages }}</span>
        <UButton size="xs" :disabled="page >= totalPages" @click="page++">Next</UButton>
      </div>
    </div>

    <UModal v-model:open="addOpen" title="Add device">
      <template #body>
        <div class="space-y-3">
          <UFormField label="Hostname or IP" required>
            <UInput v-model="addForm.hostname" placeholder="core-sw-01 or 10.0.0.1" class="w-full" />
          </UFormField>
          <UFormField label="Management IP (optional)">
            <UInput v-model="addForm.ip" placeholder="10.0.0.1" class="w-full" />
          </UFormField>
          <UCheckbox v-model="addForm.snmp_disabled" label="ICMP-only (no SNMP)" />
          <template v-if="!addForm.snmp_disabled">
            <UFormField label="SNMP version">
              <USelect v-model="addForm.snmp_version" :items="[{value:'v1',label:'v1'},{value:'v2c',label:'v2c'},{value:'v3',label:'v3'}]" class="w-full" />
            </UFormField>
            <UFormField v-if="addForm.snmp_version !== 'v3'" label="Community">
              <UInput v-model="addForm.snmp_community" type="password" placeholder="public" class="w-full" />
            </UFormField>
            <p v-else class="text-xs text-muted">For SNMPv3, add the device then set v3 credentials in its Settings tab.</p>
          </template>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" @click="addOpen = false">Cancel</UButton>
          <UButton :loading="adding" :disabled="!addForm.hostname" @click="submitAdd">Add device</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
