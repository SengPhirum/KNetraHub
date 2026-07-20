<script setup lang="ts">
// Circuits: physical/logical/virtual links between two endpoints, tracked for
// provider, customer, and expiry.
const { hasApp } = useAuth()
const { canCreate, canUpdate, canDelete } = useIpam()
const toast = useToast()

const { data: circuits, status, error, refresh } = useAsyncData('ipamCircuits', () => $fetch<any[]>('/api/ipmgt/circuits'), { server: false, default: () => [] })
const { data: providers, refresh: refreshProviders } = useAsyncData('ipamCircuitProviders', () => $fetch<any[]>('/api/ipmgt/circuit-providers'), { server: false, default: () => [] })
const { data: customers } = useAsyncData('ipamRefCustomers', () => $fetch<any[]>('/api/ipmgt/customers'), { server: false, default: () => [] })
const { data: locations } = useAsyncData('ipamRefLocations', () => $fetch<any[]>('/api/ipmgt/locations'), { server: false, default: () => [] })
const { data: devices } = useAsyncData('ipamRefDevices', () => $fetch<any[]>('/api/ipmgt/devices'), { server: false, default: () => [] })

const providerItems = computed(() => [{ value: '', label: '— None —' }, ...(providers.value || []).map((p: any) => ({ value: p.id, label: p.name }))])
const customerItems = computed(() => [{ value: '', label: '— None —' }, ...(customers.value || []).map((c: any) => ({ value: c.id, label: c.name }))])
const locationItems = computed(() => [{ value: '', label: '— None —' }, ...(locations.value || []).map((l: any) => ({ value: l.id, label: l.name }))])
const deviceItems = computed(() => [{ value: '', label: '— None —' }, ...(devices.value || []).map((d: any) => ({ value: d.id, label: d.hostname }))])

const TYPE_ITEMS = [{ value: 'physical', label: 'Physical' }, { value: 'logical', label: 'Logical' }, { value: 'virtual', label: 'Virtual' }]
const STATUS_ITEMS = [{ value: 'active', label: 'Active' }, { value: 'planned', label: 'Planned' }, { value: 'suspended', label: 'Suspended' }, { value: 'decommissioned', label: 'Decommissioned' }]

const newProviderName = ref('')
async function quickAddProvider() {
  if (!newProviderName.value.trim()) return
  try {
    const res: any = await $fetch('/api/ipmgt/circuit-providers', { method: 'POST', body: { name: newProviderName.value.trim() } })
    await refreshProviders()
    form.provider_id = res.id
    newProviderName.value = ''
  } catch (e: any) { toast.add({ title: 'Add provider failed', description: e?.data?.statusMessage, color: 'error' }) }
}

const emptyForm = () => ({
  circuit_ref: '', provider_id: '', circuit_type: 'physical', status: 'active', bandwidth: '', description: '',
  customer_id: '', order_reference: '', install_date: '', expiry_date: '',
  endpoint_a_location_id: '', endpoint_a_device_id: '', endpoint_a_note: '',
  endpoint_b_location_id: '', endpoint_b_device_id: '', endpoint_b_note: '', notes: ''
})
const dialog = reactive({ open: false, editing: null as any })
const form = reactive(emptyForm())
const saving = ref(false)
function openCreate() { dialog.editing = null; Object.assign(form, emptyForm()); dialog.open = true }
function openEdit(c: any) {
  dialog.editing = c
  Object.assign(form, {
    circuit_ref: c.circuit_ref, provider_id: c.provider_id || '', circuit_type: c.circuit_type, status: c.status,
    bandwidth: c.bandwidth || '', description: c.description || '', customer_id: c.customer_id || '',
    order_reference: c.order_reference || '', install_date: c.install_date || '', expiry_date: c.expiry_date || '',
    endpoint_a_location_id: c.endpoint_a_location_id || '', endpoint_a_device_id: c.endpoint_a_device_id || '', endpoint_a_note: c.endpoint_a_note || '',
    endpoint_b_location_id: c.endpoint_b_location_id || '', endpoint_b_device_id: c.endpoint_b_device_id || '', endpoint_b_note: c.endpoint_b_note || '',
    notes: c.notes || ''
  })
  dialog.open = true
}
async function save() {
  if (!form.circuit_ref.trim()) return
  saving.value = true
  try {
    const body: any = { ...form }
    for (const k of ['provider_id', 'customer_id', 'endpoint_a_location_id', 'endpoint_a_device_id', 'endpoint_b_location_id', 'endpoint_b_device_id', 'install_date', 'expiry_date']) {
      body[k] = body[k] || null
    }
    if (dialog.editing) await $fetch(`/api/ipmgt/circuits/${dialog.editing.id}`, { method: 'PUT', body })
    else await $fetch('/api/ipmgt/circuits', { method: 'POST', body })
    toast.add({ title: dialog.editing ? 'Circuit updated' : 'Circuit created', color: 'primary', icon: 'i-lucide-check' })
    dialog.open = false
    await refresh()
  } catch (e: any) { toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' }) }
  finally { saving.value = false }
}

const deleteTarget = ref<any | null>(null)
async function confirmDelete(headers: Record<string, string>) {
  const c = deleteTarget.value
  if (!c) return
  await $fetch(`/api/ipmgt/circuits/${c.id}`, { method: 'DELETE', headers })
  toast.add({ title: 'Circuit deleted', color: 'primary', icon: 'i-lucide-check' })
  deleteTarget.value = null
  await refresh()
}

function statusClass(s: string) {
  return s === 'active' ? 'text-emerald-400' : s === 'planned' ? 'text-sky-400' : s === 'suspended' ? 'text-amber-400' : 'text-faint'
}
function expiryClass(date: string | null) {
  if (!date) return ''
  const days = (Date.parse(date) - Date.now()) / 86400000
  return days < 0 ? 'text-rose-400' : days < 30 ? 'text-amber-400' : ''
}
</script>

<template>
  <div>
    <PageHeader title="Circuits" subtitle="Physical, logical, and virtual links between sites" icon="i-lucide-cable">
      <template v-if="hasApp('ipmgt') && canCreate" #actions>
        <UButton icon="i-lucide-plus" size="sm" @click="openCreate">Add Circuit</UButton>
      </template>
    </PageHeader>

    <div v-if="!hasApp('ipmgt')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-IPMgt.</p>
    </div>

    <DataState v-else :status="status" :error="error" :empty="!circuits.length" empty-label="No circuits yet." empty-icon="i-lucide-cable">
      <template #empty-action>
        <UButton v-if="canCreate" class="mt-3" icon="i-lucide-plus" size="sm" @click="openCreate">Add Circuit</UButton>
      </template>
      <div class="panel overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="bg-surface-2 text-xs uppercase text-faint">
            <tr>
              <th class="px-4 py-3 font-medium">Circuit</th>
              <th class="px-4 py-3 font-medium">Provider</th>
              <th class="px-4 py-3 font-medium">Type</th>
              <th class="px-4 py-3 font-medium">Endpoint A</th>
              <th class="px-4 py-3 font-medium">Endpoint B</th>
              <th class="px-4 py-3 font-medium">Expiry</th>
              <th class="px-4 py-3 font-medium">Status</th>
              <th class="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-surface">
            <tr v-for="c in circuits" :key="c.id" class="hover:bg-surface-2/40">
              <td class="px-4 py-3">
                <div class="font-mono font-medium text-foam">{{ c.circuit_ref }}</div>
                <div v-if="c.bandwidth" class="text-xs text-faint">{{ c.bandwidth }}</div>
              </td>
              <td class="px-4 py-3 text-(--color-muted)">{{ c.provider_name || '—' }}</td>
              <td class="px-4 py-3 text-(--color-muted) capitalize">{{ c.circuit_type }}</td>
              <td class="px-4 py-3 text-(--color-muted)">{{ c.endpoint_a_location_name || c.endpoint_a_device_hostname || '—' }}</td>
              <td class="px-4 py-3 text-(--color-muted)">{{ c.endpoint_b_location_name || c.endpoint_b_device_hostname || '—' }}</td>
              <td class="px-4 py-3 text-xs" :class="expiryClass(c.expiry_date)">{{ c.expiry_date || '—' }}</td>
              <td class="px-4 py-3"><span class="text-xs capitalize" :class="statusClass(c.status)">{{ c.status }}</span></td>
              <td class="px-4 py-3">
                <div class="flex items-center justify-end gap-1">
                  <UButton v-if="canUpdate" size="xs" variant="ghost" icon="i-lucide-pencil" aria-label="Edit" @click="openEdit(c)" />
                  <UButton v-if="canDelete" size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" aria-label="Delete" @click="deleteTarget = c" />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </DataState>

    <UModal v-model:open="dialog.open" :title="dialog.editing ? 'Edit circuit' : 'Add circuit'" :ui="{ content: 'max-w-2xl' }">
      <template #body>
        <div class="space-y-4">
          <div class="grid grid-cols-3 gap-4">
            <UFormField label="Circuit ID" required>
              <UInput v-model="form.circuit_ref" placeholder="WAN-0001" class="w-full font-mono" />
            </UFormField>
            <UFormField label="Type">
              <USelect v-model="form.circuit_type" :items="TYPE_ITEMS" value-key="value" label-key="label" class="w-full" />
            </UFormField>
            <UFormField label="Status">
              <USelect v-model="form.status" :items="STATUS_ITEMS" value-key="value" label-key="label" class="w-full" />
            </UFormField>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Provider">
              <div class="flex gap-2">
                <USelect v-model="form.provider_id" :items="providerItems" value-key="value" label-key="label" class="w-full" />
              </div>
            </UFormField>
            <UFormField label="Customer">
              <USelect v-model="form.customer_id" :items="customerItems" value-key="value" label-key="label" class="w-full" />
            </UFormField>
          </div>
          <div class="flex gap-2">
            <UInput v-model="newProviderName" placeholder="New provider name…" size="sm" class="flex-1" @keyup.enter="quickAddProvider" />
            <UButton size="sm" variant="soft" icon="i-lucide-plus" @click="quickAddProvider">Add provider</UButton>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Bandwidth">
              <UInput v-model="form.bandwidth" placeholder="1 Gbps" class="w-full" />
            </UFormField>
            <UFormField label="Order reference">
              <UInput v-model="form.order_reference" class="w-full" />
            </UFormField>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Install date">
              <UInput v-model="form.install_date" type="date" class="w-full" />
            </UFormField>
            <UFormField label="Expiry date">
              <UInput v-model="form.expiry_date" type="date" class="w-full" />
            </UFormField>
          </div>
          <div class="rounded-lg bg-surface-2/40 p-3">
            <p class="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">Endpoint A</p>
            <div class="grid grid-cols-2 gap-4">
              <USelect v-model="form.endpoint_a_location_id" :items="locationItems" value-key="value" label-key="label" placeholder="Location" class="w-full" />
              <USelect v-model="form.endpoint_a_device_id" :items="deviceItems" value-key="value" label-key="label" placeholder="Device" class="w-full" />
            </div>
            <UInput v-model="form.endpoint_a_note" placeholder="Interface / note" class="mt-2 w-full" size="sm" />
          </div>
          <div class="rounded-lg bg-surface-2/40 p-3">
            <p class="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">Endpoint B</p>
            <div class="grid grid-cols-2 gap-4">
              <USelect v-model="form.endpoint_b_location_id" :items="locationItems" value-key="value" label-key="label" placeholder="Location" class="w-full" />
              <USelect v-model="form.endpoint_b_device_id" :items="deviceItems" value-key="value" label-key="label" placeholder="Device" class="w-full" />
            </div>
            <UInput v-model="form.endpoint_b_note" placeholder="Interface / note" class="mt-2 w-full" size="sm" />
          </div>
          <UFormField label="Description">
            <UTextarea v-model="form.description" class="w-full" :rows="2" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-3">
          <UButton variant="ghost" @click="dialog.open = false">Cancel</UButton>
          <UButton color="primary" :loading="saving" :disabled="!form.circuit_ref.trim()" @click="save">{{ dialog.editing ? 'Save' : 'Create' }}</UButton>
        </div>
      </template>
    </UModal>

    <ConfirmDeleteModal
      type="ipmgt.circuit"
      :item-name="deleteTarget?.circuit_ref"
      :open="!!deleteTarget"
      @update:open="(v: boolean) => { if (!v) deleteTarget = null }"
      title="Delete circuit"
      :message="deleteTarget ? `Circuit ${deleteTarget.circuit_ref} will be permanently removed.` : ''"
      confirm-label="Delete"
      :action="confirmDelete"
    />
  </div>
</template>
