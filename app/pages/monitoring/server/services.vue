<script setup lang="ts">
// Zabbix Services / SLA: a service tree whose status rolls up from mapped
// triggers, with a 24h SLA vs target.
const { hasApp, hasPermission } = useAuth()
const toast = useToast()
const canManage = computed(() => hasPermission('monitoring.manage'))

const period = ref('24h')
const periodItems = [{ value: '24h', label: '24 hours' }, { value: '7d', label: '7 days' }, { value: '30d', label: '30 days' }]
const { data: resp, status, refresh } = useAsyncData('serverServices', () => $fetch<any>(`/api/server/services?period=${period.value}`), { watch: [period], default: () => ({ services: [] }), server: false })
const { data: triggers } = useAsyncData('serverServiceTriggers', () => $fetch<any[]>('/api/server/triggers'), { default: () => [] })
onMounted(() => { const t = setInterval(refresh, 20000); onUnmounted(() => clearInterval(t)) })

const services = computed(() => resp.value?.services || [])

// Flatten the parent/child tree into an ordered list with depth for indentation.
const ordered = computed(() => {
  const list = services.value || []
  const childrenOf = new Map<string | null, any[]>()
  for (const s of list) { const k = s.parent_id || null; if (!childrenOf.has(k)) childrenOf.set(k, []); childrenOf.get(k)!.push(s) }
  const out: any[] = []
  const walk = (parent: string | null, depth: number) => {
    for (const s of childrenOf.get(parent) || []) { out.push({ ...s, depth }); walk(s.id, depth + 1) }
  }
  walk(null, 0)
  return out
})

const parentItems = computed(() => [{ value: '', label: '— Root —' }, ...(services.value || []).map((s) => ({ value: s.id, label: s.name }))])
const triggerItems = computed(() => [{ value: '', label: '— None (parent service) —' }, ...(triggers.value || []).map((t) => ({ value: t.id, label: `${t.host_name}: ${t.name}` }))])
const algoItems = [{ value: 'worst', label: 'Worst of children' }, { value: 'most', label: 'Most of children' }]

const open = ref(false)
const saving = ref(false)
const form = reactive<any>({ name: '', parent_id: '', algorithm: 'worst', sla_target: 99.9, trigger_id: '' })
function openCreate() { Object.assign(form, { name: '', parent_id: '', algorithm: 'worst', sla_target: 99.9, trigger_id: '' }); open.value = true }
async function save() {
  if (!form.name.trim()) { toast.add({ title: 'Name is required', color: 'error' }); return }
  saving.value = true
  try {
    await $fetch('/api/server/services', { method: 'POST', body: { ...form, parent_id: form.parent_id || null, trigger_id: form.trigger_id || null } })
    toast.add({ title: 'Service created', color: 'primary', icon: 'i-lucide-check' })
    open.value = false; await refresh()
  } catch (e: any) { toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' }) }
  finally { saving.value = false }
}
async function del(s: any) { if (!confirm(`Delete service "${s.name}"?`)) return; await $fetch(`/api/server/services/${s.id}`, { method: 'DELETE' }); await refresh() }

function slaClass(s: any) { return s.sla >= s.sla_target ? 'text-green-500' : 'text-red-500' }
</script>

<template>
  <div>
    <PageHeader title="Services" subtitle="Business service tree with SLA rollup" icon="i-lucide-gauge-circle">
      <template v-if="hasApp('monitoring')" #actions>
        <div class="flex items-center gap-2">
          <USelect v-model="period" :items="periodItems" value-key="value" label-key="label" size="sm" class="w-32" />
          <UButton v-if="canManage" icon="i-lucide-plus" size="sm" @click="openCreate">Create service</UButton>
        </div>
      </template>
    </PageHeader>

    <div v-if="!hasApp('monitoring')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-Monitoring.</p>
    </div>

    <div v-else class="panel">
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm text-(--color-muted)">
          <thead class="bg-surface-2 text-xs uppercase text-faint border-b border-surface">
            <tr><th class="px-4 py-3 font-medium">Service</th><th class="px-4 py-3 font-medium">Status</th><th class="px-4 py-3 font-medium">SLA ({{ period }})</th><th class="px-4 py-3 font-medium">Target</th><th class="px-4 py-3 font-medium text-right">Actions</th></tr>
          </thead>
          <tbody class="divide-y divide-surface">
            <tr v-if="status === 'pending' && !ordered.length"><td colspan="5" class="px-4 py-8 text-center text-faint">Loading…</td></tr>
            <tr v-else-if="!ordered.length"><td colspan="5" class="px-4 py-8 text-center text-faint">No services. Build a tree that maps to triggers.</td></tr>
            <tr v-for="s in ordered" :key="s.id" class="hover:bg-surface-2/50 transition">
              <td class="px-4 py-3 text-foam"><span :style="{ paddingLeft: (s.depth * 20) + 'px' }">{{ s.name }}</span></td>
              <td class="px-4 py-3"><UBadge :color="s.status === 'problem' ? 'error' : 'success'" variant="subtle" size="xs">{{ s.status === 'problem' ? 'Problem' : 'OK' }}</UBadge></td>
              <td class="px-4 py-3 font-display font-semibold" :class="slaClass(s)">{{ s.sla }}%</td>
              <td class="px-4 py-3 text-xs">{{ s.sla_target }}%</td>
              <td class="px-4 py-3 text-right"><UButton v-if="canManage" size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" aria-label="Delete" @click="del(s)" /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <UModal v-model:open="open" title="Create service">
      <template #body>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Name" required class="sm:col-span-2"><UInput v-model="form.name" class="w-full" /></UFormField>
          <UFormField label="Parent"><USelect v-model="form.parent_id" :items="parentItems" value-key="value" label-key="label" class="w-full" /></UFormField>
          <UFormField label="Algorithm"><USelect v-model="form.algorithm" :items="algoItems" value-key="value" label-key="label" class="w-full" /></UFormField>
          <UFormField label="Mapped trigger (leaf)" class="sm:col-span-2"><USelect v-model="form.trigger_id" :items="triggerItems" value-key="value" label-key="label" class="w-full" /></UFormField>
          <UFormField label="SLA target %"><UInput v-model.number="form.sla_target" type="number" step="0.1" class="w-full" /></UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="open = false">Cancel</UButton>
          <UButton color="primary" :loading="saving" @click="save">Create</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
