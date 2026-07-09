<script setup lang="ts">
// Zabbix Triggers: threshold conditions on items that open problems. CRUD.
const { hasApp, hasPermission } = useAuth()
const toast = useToast()
const canManage = computed(() => hasPermission('monitoring.manage'))

const { data: triggers, status, refresh } = useAsyncData('serverTriggers', () => $fetch<any[]>('/api/server/triggers'), { default: () => [], server: false })
const { data: hosts } = useAsyncData('serverTriggerHosts', () => $fetch<any[]>('/api/server/hosts'), { default: () => [] })
onMounted(() => { const t = setInterval(() => { if (!document.hidden) refresh() }, 15000); onUnmounted(() => clearInterval(t)) })

const operators = ['>', '<', '>=', '<=', '=', '!='].map((o) => ({ value: o, label: o }))
const hostItems = computed(() => (hosts.value || []).map((h) => ({ value: h.id, label: h.name })))

const open = ref(false)
const editing = ref<any>(null)
const saving = ref(false)
const form = reactive<any>({ host_id: '', item_id: '', name: '', operator: '>', threshold: 0, for_seconds: 0, severity: 2 })
const items = ref<any[]>([])
const itemOptions = computed(() => items.value.map((i) => ({ value: i.id, label: `${i.name} (${i.key_})` })))

watch(() => form.host_id, async (hid) => {
  items.value = hid ? await $fetch<any[]>(`/api/server/items?host=${hid}`) : []
})

function openCreate() { editing.value = null; Object.assign(form, { host_id: '', item_id: '', name: '', operator: '>', threshold: 0, for_seconds: 0, severity: 2 }); items.value = []; open.value = true }
async function openEdit(t: any) {
  editing.value = t
  Object.assign(form, { host_id: t.host_id, item_id: t.item_id, name: t.name, operator: t.operator, threshold: Number(t.threshold), for_seconds: Number(t.for_seconds), severity: Number(t.severity) })
  items.value = await $fetch<any[]>(`/api/server/items?host=${t.host_id}`)
  open.value = true
}
async function save() {
  if (!form.host_id || !form.name.trim()) { toast.add({ title: 'Host and name are required', color: 'error' }); return }
  saving.value = true
  try {
    if (editing.value) await $fetch(`/api/server/triggers/${editing.value.id}`, { method: 'PUT', body: { ...form } })
    else await $fetch('/api/server/triggers', { method: 'POST', body: { ...form } })
    toast.add({ title: editing.value ? 'Trigger updated' : 'Trigger created', color: 'primary', icon: 'i-lucide-check' })
    open.value = false; await refresh()
  } catch (e: any) { toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' }) }
  finally { saving.value = false }
}
async function del(t: any) {
  if (!confirm(`Delete trigger "${t.name}"?`)) return
  await $fetch(`/api/server/triggers/${t.id}`, { method: 'DELETE' }); await refresh()
}
</script>

<template>
  <div>
    <PageHeader title="Triggers" subtitle="Threshold conditions that raise problems" icon="i-lucide-zap">
      <template v-if="hasApp('monitoring') && canManage" #actions>
        <UButton icon="i-lucide-plus" size="sm" @click="openCreate">Create trigger</UButton>
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
            <tr>
              <th class="px-4 py-3 font-medium">Severity</th>
              <th class="px-4 py-3 font-medium">Host</th>
              <th class="px-4 py-3 font-medium">Name</th>
              <th class="px-4 py-3 font-medium">Condition</th>
              <th class="px-4 py-3 font-medium">State</th>
              <th class="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-surface">
            <tr v-if="status === 'pending' && !triggers.length"><td colspan="6" class="px-4 py-8 text-center text-faint">Loading…</td></tr>
            <tr v-else-if="!triggers.length"><td colspan="6" class="px-4 py-8 text-center text-faint">No triggers. Link a template or create one.</td></tr>
            <tr v-for="t in triggers" :key="t.id" class="hover:bg-surface-2/50 transition">
              <td class="px-4 py-3"><span class="px-2 py-0.5 rounded text-xs font-medium" :class="severityMeta(t.severity).badge">{{ severityMeta(t.severity).label }}</span></td>
              <td class="px-4 py-3 text-foam">{{ t.host_name }}</td>
              <td class="px-4 py-3">{{ t.name }}<UBadge v-if="t.status === 'disabled'" color="neutral" variant="subtle" size="xs" class="ml-1">disabled</UBadge></td>
              <td class="px-4 py-3 font-mono text-xs">{{ t.item_key || '—' }} {{ t.operator }} {{ t.threshold }} <span v-if="t.for_seconds" class="text-faint">for {{ t.for_seconds }}s</span></td>
              <td class="px-4 py-3"><span :class="t.last_state === 'problem' ? 'text-red-500' : 'text-green-500'">{{ t.last_state === 'problem' ? 'Problem' : 'OK' }}</span></td>
              <td class="px-4 py-3 text-right">
                <div v-if="canManage" class="flex justify-end gap-1">
                  <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-pencil" aria-label="Edit" @click="openEdit(t)" />
                  <UButton size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" aria-label="Delete" @click="del(t)" />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <UModal v-model:open="open" :title="editing ? 'Edit trigger' : 'Create trigger'">
      <template #body>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Host" required><USelect v-model="form.host_id" :items="hostItems" value-key="value" label-key="label" class="w-full" :disabled="!!editing" /></UFormField>
          <UFormField label="Item"><USelect v-model="form.item_id" :items="itemOptions" value-key="value" label-key="label" class="w-full" placeholder="Bind to an item" /></UFormField>
          <UFormField label="Name" required class="sm:col-span-2"><UInput v-model="form.name" class="w-full" placeholder="High CPU utilization" /></UFormField>
          <UFormField label="Operator"><USelect v-model="form.operator" :items="operators" value-key="value" label-key="label" class="w-full" /></UFormField>
          <UFormField label="Threshold"><UInput v-model.number="form.threshold" type="number" class="w-full" /></UFormField>
          <UFormField label="For (seconds)"><UInput v-model.number="form.for_seconds" type="number" class="w-full" /></UFormField>
          <UFormField label="Severity"><USelect v-model="form.severity" :items="SEVERITY_SELECT_ITEMS" value-key="value" label-key="label" class="w-full" /></UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="open = false">Cancel</UButton>
          <UButton color="primary" :loading="saving" @click="save">{{ editing ? 'Save' : 'Create' }}</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
