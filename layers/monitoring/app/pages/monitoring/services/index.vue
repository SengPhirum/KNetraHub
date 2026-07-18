<script setup lang="ts">
// Services — full CRUD (admin tier). Native checks only (no shell commands):
// icmp/tcp/http/dns/certificate/smtp/ssh/ntp with per-type parameters.
const { hasMonitoring, canManage } = useMonitoring()
const toast = useToast()

const { data, status, refresh } = useAsyncData('monServices',
  () => $fetch<any>('/api/monitoring/v1/services?per_page=200'),
  { server: false, default: () => ({ items: [] }) })

const { data: devicesData } = useAsyncData('monServiceDevices',
  () => $fetch<any>('/api/monitoring/v1/devices?per_page=500'),
  { server: false, default: () => ({ items: [] }) })
const deviceItems = computed(() => [
  { value: null, label: '— standalone (no device) —' },
  ...(devicesData.value?.items ?? []).map((d: any) => ({ value: d.id, label: d.display_name || d.hostname }))
])

interface ParamField { key: string; label: string; type?: 'text' | 'number'; placeholder?: string; required?: boolean }
const PARAM_FIELDS: Record<string, ParamField[]> = {
  icmp: [{ key: 'host', label: 'Host', placeholder: '10.0.0.1', required: true }],
  tcp: [
    { key: 'host', label: 'Host', required: true },
    { key: 'port', label: 'Port', type: 'number', required: true }
  ],
  http: [
    { key: 'url', label: 'URL', placeholder: 'https://example.com/health', required: true },
    { key: 'expect_status', label: 'Expected status (blank = <400)', type: 'number' },
    { key: 'expect_body', label: 'Body must contain' }
  ],
  dns: [
    { key: 'name', label: 'Name to resolve', placeholder: 'example.com', required: true },
    { key: 'record_type', label: 'Record type', placeholder: 'A' },
    { key: 'server', label: 'DNS server (blank = system)' },
    { key: 'expect', label: 'Answer must contain' }
  ],
  certificate: [
    { key: 'host', label: 'Host', required: true },
    { key: 'port', label: 'Port', type: 'number', placeholder: '443' },
    { key: 'warn_days', label: 'Warn days before expiry', type: 'number', placeholder: '21' },
    { key: 'crit_days', label: 'Critical days before expiry', type: 'number', placeholder: '7' }
  ],
  smtp: [
    { key: 'host', label: 'Host', required: true },
    { key: 'port', label: 'Port', type: 'number', placeholder: '25' }
  ],
  ssh: [
    { key: 'host', label: 'Host', required: true },
    { key: 'port', label: 'Port', type: 'number', placeholder: '22' }
  ],
  ntp: [
    { key: 'host', label: 'Host', required: true },
    { key: 'port', label: 'Port', type: 'number', placeholder: '123' }
  ]
}
const typeItems = Object.keys(PARAM_FIELDS).map((t) => ({ value: t, label: t }))

const form = reactive({
  name: '', type: 'http', device_id: null as number | null,
  params: {} as Record<string, any>,
  interval_seconds: 300, retry_interval_seconds: 60, timeout_ms: 10000,
  warn_response_ms: '' as any, crit_response_ms: '' as any, enabled: true, poller_group: 0
})
const editingId = ref<number | null>(null)
const modalOpen = ref(false)
const saving = ref(false)

watch(() => form.type, (_, oldType) => {
  if (oldType !== undefined) form.params = {}
})

function openCreate() {
  editingId.value = null
  Object.assign(form, {
    name: '', type: 'http', device_id: null, params: {},
    interval_seconds: 300, retry_interval_seconds: 60, timeout_ms: 10000,
    warn_response_ms: '', crit_response_ms: '', enabled: true, poller_group: 0
  })
  modalOpen.value = true
}
async function openEdit(s: any) {
  editingId.value = s.id
  Object.assign(form, {
    name: s.name, type: s.type, device_id: s.device_id ?? null, params: {},
    interval_seconds: s.interval_seconds ?? 300, retry_interval_seconds: s.retry_interval_seconds ?? 60,
    timeout_ms: s.timeout_ms ?? 10000,
    warn_response_ms: s.warn_response_ms ?? '', crit_response_ms: s.crit_response_ms ?? '',
    enabled: !!s.enabled, poller_group: s.poller_group ?? 0
  })
  // List payload is trimmed; params come with the row when present.
  await nextTick()
  form.params = { ...(s.params ?? {}) }
  modalOpen.value = true
}

const paramsComplete = computed(() =>
  (PARAM_FIELDS[form.type] ?? []).every((f) => !f.required || String(form.params[f.key] ?? '').trim()))

async function save() {
  saving.value = true
  try {
    const body = {
      name: form.name, type: form.type, device_id: form.device_id,
      params: { ...form.params },
      interval_seconds: form.interval_seconds, retry_interval_seconds: form.retry_interval_seconds,
      timeout_ms: form.timeout_ms,
      warn_response_ms: form.warn_response_ms === '' ? null : Number(form.warn_response_ms),
      crit_response_ms: form.crit_response_ms === '' ? null : Number(form.crit_response_ms),
      enabled: form.enabled, poller_group: form.poller_group
    }
    if (editingId.value) {
      await $fetch(`/api/monitoring/v1/services/${editingId.value}`, { method: 'PUT', body })
      toast.add({ title: 'Service updated', color: 'primary', icon: 'i-lucide-check' })
    } else {
      await $fetch('/api/monitoring/v1/services', { method: 'POST', body })
      toast.add({ title: 'Service created', color: 'primary', icon: 'i-lucide-check' })
    }
    modalOpen.value = false
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' })
  } finally { saving.value = false }
}

const deleteTarget = ref<any>(null)
const deleting = ref(false)
async function confirmDelete() {
  if (!deleteTarget.value) return
  deleting.value = true
  try {
    await $fetch(`/api/monitoring/v1/services/${deleteTarget.value.id}`, { method: 'DELETE' })
    toast.add({ title: 'Service deleted', color: 'primary', icon: 'i-lucide-check' })
    deleteTarget.value = null
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Delete failed', description: e?.data?.statusMessage, color: 'error' })
  } finally { deleting.value = false }
}

function statusClass(s: string): string {
  return s === 'ok' ? 'text-emerald-400' : s === 'warning' ? 'text-amber-400' : s === 'critical' ? 'text-rose-400' : 'text-faint'
}
</script>

<template>
  <div>
    <PageHeader title="Services" subtitle="Active service checks" icon="i-lucide-gauge-circle">
      <template v-if="hasMonitoring && canManage" #actions>
        <UButton icon="i-lucide-plus" size="sm" @click="openCreate">Add service</UButton>
      </template>
    </PageHeader>
    <div v-if="!hasMonitoring" class="panel p-10 text-center text-muted">No access.</div>
    <div v-else class="panel overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-surface-2 text-left text-xs uppercase text-faint">
          <tr><th class="px-3 py-2">Service</th><th class="px-3 py-2">Type</th><th class="px-3 py-2">Device</th>
            <th class="px-3 py-2">Status</th><th class="px-3 py-2 text-right">Response</th>
            <th class="px-3 py-2">Message</th><th v-if="canManage" class="px-3 py-2" /></tr>
        </thead>
        <tbody>
          <tr v-if="status === 'pending'"><td colspan="7" class="px-3 py-8 text-center text-muted">Loading…</td></tr>
          <tr v-else-if="!data.items?.length"><td colspan="7" class="px-3 py-8 text-center text-muted">No service checks yet — add HTTP/TCP/DNS/certificate checks against anything reachable.</td></tr>
          <tr v-for="s in data.items" :key="s.id" class="border-t border-hull">
            <td class="px-3 py-2 font-medium">{{ s.name }}<span v-if="!s.enabled" class="ml-1 text-xs text-faint">(disabled)</span></td>
            <td class="px-3 py-2 text-muted">{{ s.type }}</td>
            <td class="px-3 py-2">
              <NuxtLink v-if="s.device_id" :to="`/monitoring/devices/${s.device_id}`" class="text-primary hover:underline">{{ s.hostname }}</NuxtLink>
              <span v-else class="text-faint">—</span>
            </td>
            <td class="px-3 py-2"><span :class="statusClass(s.status)">{{ s.status }}</span></td>
            <td class="px-3 py-2 text-right text-muted">{{ s.last_response_ms != null ? s.last_response_ms.toFixed(0) + ' ms' : '—' }}</td>
            <td class="px-3 py-2 text-xs text-muted">{{ s.status_message || '—' }}</td>
            <td v-if="canManage" class="px-3 py-2 text-right whitespace-nowrap">
              <UButton size="xs" variant="ghost" icon="i-lucide-pencil" @click="openEdit(s)" />
              <UButton size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" @click="deleteTarget = s" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <UModal v-model:open="modalOpen" :title="editingId ? 'Edit service' : 'Add service'" :ui="{ content: 'max-w-xl' }">
      <template #body>
        <div class="space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Name" required><UInput v-model="form.name" placeholder="Website health" class="w-full" /></UFormField>
            <UFormField label="Type"><USelect v-model="form.type" :items="typeItems" class="w-full" /></UFormField>
          </div>
          <UFormField label="Attach to device (optional)">
            <USelectMenu v-model="form.device_id" :items="deviceItems" value-key="value" searchable class="w-full" />
          </UFormField>

          <div class="grid grid-cols-2 gap-3">
            <UFormField v-for="f in PARAM_FIELDS[form.type]" :key="f.key" :label="f.label" :required="f.required">
              <UInput v-model="form.params[f.key]" :type="f.type ?? 'text'" :placeholder="f.placeholder" class="w-full" />
            </UFormField>
          </div>

          <div class="grid grid-cols-3 gap-3">
            <UFormField label="Interval (s)"><UInput v-model.number="form.interval_seconds" type="number" min="30" class="w-full" /></UFormField>
            <UFormField label="Retry when failing (s)"><UInput v-model.number="form.retry_interval_seconds" type="number" min="10" class="w-full" /></UFormField>
            <UFormField label="Timeout (ms)"><UInput v-model.number="form.timeout_ms" type="number" min="500" class="w-full" /></UFormField>
          </div>
          <div class="grid grid-cols-3 gap-3">
            <UFormField label="Warn if slower than (ms)"><UInput v-model="form.warn_response_ms" type="number" class="w-full" /></UFormField>
            <UFormField label="Critical if slower than (ms)"><UInput v-model="form.crit_response_ms" type="number" class="w-full" /></UFormField>
            <UFormField label="Poller group"><UInput v-model.number="form.poller_group" type="number" class="w-full" /></UFormField>
          </div>
          <UCheckbox v-model="form.enabled" label="Enabled" />
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" @click="modalOpen = false">Cancel</UButton>
          <UButton :loading="saving" :disabled="!form.name || !paramsComplete" @click="save">{{ editingId ? 'Save' : 'Add service' }}</UButton>
        </div>
      </template>
    </UModal>

    <UModal :open="!!deleteTarget" title="Delete service" @update:open="(v) => !v && (deleteTarget = null)">
      <template #body>
        <p class="text-sm text-muted">Delete <strong>{{ deleteTarget?.name }}</strong> and its check history?</p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" @click="deleteTarget = null">Cancel</UButton>
          <UButton color="error" :loading="deleting" @click="confirmDelete">Delete</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
