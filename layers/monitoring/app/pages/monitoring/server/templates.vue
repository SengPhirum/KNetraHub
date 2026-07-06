<script setup lang="ts">
// Zabbix templates: reusable Item + Trigger bundles that link onto hosts. Manage
// templates and their item/trigger definitions here; link them from a host.
// severityMeta / SEVERITY_SELECT_ITEMS are auto-imported from app/utils/serverSeverity.
const { hasApp, hasPermission } = useAuth()
const toast = useToast()
const canManage = computed(() => hasPermission('monitoring.manage'))

const { data: templates, status, refresh } = useAsyncData('serverTemplates', () => $fetch<any[]>('/api/server/templates'), { default: () => [] })

const selectedId = ref<string | null>(null)
const { data: detail, refresh: refreshDetail } = useAsyncData('serverTemplateDetail',
  () => selectedId.value ? $fetch<any>(`/api/server/templates/${selectedId.value}`) : Promise.resolve(null),
  { watch: [selectedId], default: () => null })

async function select(t: any) { selectedId.value = t.id }

// Create template
const createOpen = ref(false)
const createForm = reactive({ name: '', description: '' })
async function createTemplate() {
  if (!createForm.name.trim()) return
  try {
    const { id } = await $fetch<{ id: string }>('/api/server/templates', { method: 'POST', body: { ...createForm } })
    toast.add({ title: 'Template created', color: 'primary', icon: 'i-lucide-check' })
    createOpen.value = false; createForm.name = ''; createForm.description = ''
    await refresh(); selectedId.value = id
  } catch (e: any) { toast.add({ title: 'Failed', description: e?.data?.statusMessage, color: 'error' }) }
}
async function deleteTemplate(t: any) {
  if (!confirm(`Delete template "${t.name}"? Items already provisioned on hosts stay.`)) return
  await $fetch(`/api/server/templates/${t.id}`, { method: 'DELETE' })
  if (selectedId.value === t.id) selectedId.value = null
  await refresh()
}

// Add item / trigger
const itemForm = reactive({ name: '', key_: '', units: '', snmp_oid: '', update_interval: 60 })
async function addItem() {
  if (!selectedId.value || !itemForm.name.trim() || !itemForm.key_.trim()) return
  await $fetch(`/api/server/templates/${selectedId.value}/items`, { method: 'POST', body: { ...itemForm } })
  Object.assign(itemForm, { name: '', key_: '', units: '', snmp_oid: '', update_interval: 60 })
  await refreshDetail(); await refresh()
}
async function delItem(id: string) { await $fetch(`/api/server/templates/items/${id}`, { method: 'DELETE' }); await refreshDetail(); await refresh() }

const trigForm = reactive({ name: '', item_key: '', operator: '>', threshold: 0, for_seconds: 0, severity: 2 })
const operators = ['>', '<', '>=', '<=', '=', '!='].map((o) => ({ value: o, label: o }))
async function addTrigger() {
  if (!selectedId.value || !trigForm.name.trim() || !trigForm.item_key.trim()) return
  await $fetch(`/api/server/templates/${selectedId.value}/triggers`, { method: 'POST', body: { ...trigForm } })
  Object.assign(trigForm, { name: '', item_key: '', operator: '>', threshold: 0, for_seconds: 0, severity: 2 })
  await refreshDetail(); await refresh()
}
async function delTrigger(id: string) { await $fetch(`/api/server/templates/triggers/${id}`, { method: 'DELETE' }); await refreshDetail(); await refresh() }
</script>

<template>
  <div>
    <PageHeader title="Templates" subtitle="Reusable item + trigger bundles linked onto hosts" icon="i-lucide-layout-template">
      <template v-if="hasApp('monitoring') && canManage" #actions>
        <UButton icon="i-lucide-plus" size="sm" @click="createOpen = true">Create template</UButton>
      </template>
    </PageHeader>

    <div v-if="!hasApp('monitoring')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-Monitoring.</p>
    </div>

    <div v-else class="grid gap-4 lg:grid-cols-3">
      <!-- Template list -->
      <div class="panel lg:col-span-1">
        <div class="p-3 text-xs font-semibold uppercase text-faint border-b border-surface">Templates</div>
        <ul class="divide-y divide-surface">
          <li v-if="status === 'pending' && !templates.length" class="p-4 text-center text-faint text-sm">Loading…</li>
          <li v-for="t in templates" :key="t.id">
            <button class="w-full text-left px-4 py-3 hover:bg-surface-2/50 transition flex items-center gap-2"
                    :class="selectedId === t.id ? 'bg-beacon/10' : ''" @click="select(t)">
              <div class="min-w-0 flex-1">
                <div class="font-medium text-foam truncate">{{ t.name }}</div>
                <div class="text-xs text-faint">{{ t.item_count }} items · {{ t.trigger_count }} triggers · {{ t.host_count }} hosts</div>
              </div>
              <UButton v-if="canManage" size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" aria-label="Delete" @click.stop="deleteTemplate(t)" />
            </button>
          </li>
          <li v-if="!templates.length && status !== 'pending'" class="p-4 text-center text-faint text-sm">No templates.</li>
        </ul>
      </div>

      <!-- Selected template detail -->
      <div class="lg:col-span-2 space-y-4">
        <div v-if="!detail" class="panel p-10 text-center text-faint text-sm">Select a template to view its items and triggers.</div>
        <template v-else>
          <div class="panel p-5">
            <h3 class="font-display text-base font-semibold text-foam">{{ detail.name }}</h3>
            <p class="text-sm text-(--color-muted) mt-1">{{ detail.description || 'No description' }}</p>
          </div>

          <!-- Items -->
          <div class="panel p-5">
            <h4 class="font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted) mb-3">Items</h4>
            <table class="w-full text-left text-sm text-(--color-muted)">
              <thead class="text-xs uppercase text-faint"><tr><th class="py-2">Name</th><th>Key</th><th>Units</th><th>OID</th><th></th></tr></thead>
              <tbody class="divide-y divide-surface">
                <tr v-for="i in detail.items" :key="i.id">
                  <td class="py-2 text-foam">{{ i.name }}</td>
                  <td class="font-mono text-xs">{{ i.key_ }}</td>
                  <td>{{ i.units || '—' }}</td>
                  <td class="font-mono text-xs text-faint">{{ i.snmp_oid || '—' }}</td>
                  <td class="text-right"><UButton v-if="canManage" size="xs" variant="ghost" color="error" icon="i-lucide-x" @click="delItem(i.id)" /></td>
                </tr>
                <tr v-if="!detail.items.length"><td colspan="5" class="py-3 text-faint text-center">No items.</td></tr>
              </tbody>
            </table>
            <div v-if="canManage" class="mt-3 grid gap-2 sm:grid-cols-5 items-end border-t border-hull pt-3">
              <UFormField label="Name" size="xs"><UInput v-model="itemForm.name" size="xs" class="w-full" /></UFormField>
              <UFormField label="Key" size="xs"><UInput v-model="itemForm.key_" size="xs" class="w-full" placeholder="system.cpu.util" /></UFormField>
              <UFormField label="Units" size="xs"><UInput v-model="itemForm.units" size="xs" class="w-full" placeholder="%" /></UFormField>
              <UFormField label="SNMP OID" size="xs"><UInput v-model="itemForm.snmp_oid" size="xs" class="w-full" /></UFormField>
              <UButton size="xs" color="primary" icon="i-lucide-plus" @click="addItem">Add item</UButton>
            </div>
          </div>

          <!-- Triggers -->
          <div class="panel p-5">
            <h4 class="font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted) mb-3">Triggers</h4>
            <table class="w-full text-left text-sm text-(--color-muted)">
              <thead class="text-xs uppercase text-faint"><tr><th class="py-2">Name</th><th>Condition</th><th>Severity</th><th></th></tr></thead>
              <tbody class="divide-y divide-surface">
                <tr v-for="t in detail.triggers" :key="t.id">
                  <td class="py-2 text-foam">{{ t.name }}</td>
                  <td class="font-mono text-xs">{{ t.item_key }} {{ t.operator }} {{ t.threshold }} <span v-if="t.for_seconds">for {{ t.for_seconds }}s</span></td>
                  <td><span class="px-2 py-0.5 rounded text-xs" :class="severityMeta(t.severity).badge">{{ severityMeta(t.severity).label }}</span></td>
                  <td class="text-right"><UButton v-if="canManage" size="xs" variant="ghost" color="error" icon="i-lucide-x" @click="delTrigger(t.id)" /></td>
                </tr>
                <tr v-if="!detail.triggers.length"><td colspan="4" class="py-3 text-faint text-center">No triggers.</td></tr>
              </tbody>
            </table>
            <div v-if="canManage" class="mt-3 grid gap-2 sm:grid-cols-6 items-end border-t border-hull pt-3">
              <UFormField label="Name" size="xs" class="sm:col-span-2"><UInput v-model="trigForm.name" size="xs" class="w-full" /></UFormField>
              <UFormField label="Item key" size="xs"><UInput v-model="trigForm.item_key" size="xs" class="w-full" placeholder="system.cpu.util" /></UFormField>
              <UFormField label="Op" size="xs"><USelect v-model="trigForm.operator" :items="operators" value-key="value" label-key="label" size="xs" class="w-full" /></UFormField>
              <UFormField label="Threshold" size="xs"><UInput v-model.number="trigForm.threshold" type="number" size="xs" class="w-full" /></UFormField>
              <UFormField label="Severity" size="xs"><USelect v-model="trigForm.severity" :items="SEVERITY_SELECT_ITEMS" value-key="value" label-key="label" size="xs" class="w-full" /></UFormField>
              <UButton size="xs" color="primary" icon="i-lucide-plus" class="sm:col-span-6 justify-center" @click="addTrigger">Add trigger</UButton>
            </div>
          </div>
        </template>
      </div>
    </div>

    <UModal v-model:open="createOpen" title="Create template">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Name" required><UInput v-model="createForm.name" class="w-full" placeholder="Linux by SNMP" /></UFormField>
          <UFormField label="Description"><UTextarea v-model="createForm.description" class="w-full" :rows="2" /></UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="createOpen = false">Cancel</UButton>
          <UButton color="primary" @click="createTemplate">Create</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
