<script setup lang="ts">
// Customers: tenants/organizations that subnets, VLANs, VRFs, addresses, and
// devices can be attributed to (MSP/hosting-style ownership).
const { hasApp } = useAuth()
const { canCreate, canUpdate, canDelete } = useIpam()
const toast = useToast()

const { data: customers, status, error, refresh } = useAsyncData('ipamCustomers', () => $fetch<any[]>('/api/ipmgt/customers'), { server: false, default: () => [] })

const STATUS_ITEMS = [
  { value: 'active', label: 'Active' },
  { value: 'reserved', label: 'Reserved' },
  { value: 'inactive', label: 'Inactive' }
]

const emptyForm = () => ({
  name: '', address: '', city: '', state: '', postal_code: '', country: '',
  contact_person: '', phone: '', email: '', status: 'active', notes: ''
})

const dialog = reactive({ open: false, editing: null as any })
const form = reactive(emptyForm())
const saving = ref(false)
const cfRef = ref()
function openCreate() { dialog.editing = null; Object.assign(form, emptyForm()); dialog.open = true }
function openEdit(c: any) {
  dialog.editing = c
  Object.assign(form, {
    name: c.name, address: c.address || '', city: c.city || '', state: c.state || '',
    postal_code: c.postal_code || '', country: c.country || '', contact_person: c.contact_person || '',
    phone: c.phone || '', email: c.email || '', status: c.status || 'active', notes: c.notes || ''
  })
  dialog.open = true
}
async function save() {
  if (!form.name.trim()) return
  saving.value = true
  try {
    let id = dialog.editing?.id
    if (dialog.editing) await $fetch(`/api/ipmgt/customers/${dialog.editing.id}`, { method: 'PUT', body: form })
    else { const res: any = await $fetch('/api/ipmgt/customers', { method: 'POST', body: form }); id = res.id }
    await cfRef.value?.saveValues(id)
    toast.add({ title: dialog.editing ? 'Customer updated' : 'Customer created', color: 'primary', icon: 'i-lucide-check' })
    dialog.open = false
    await refresh()
  } catch (e: any) { toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' }) }
  finally { saving.value = false }
}

const deleteTarget = ref<any | null>(null)
async function confirmDelete(password: string) {
  const c = deleteTarget.value
  if (!c) return
  await $fetch(`/api/ipmgt/customers/${c.id}`, { method: 'DELETE', headers: { 'x-confirm-password': password } })
  toast.add({ title: 'Customer deleted', color: 'primary', icon: 'i-lucide-check' })
  deleteTarget.value = null
  await refresh()
}

function statusClass(s: string) {
  return s === 'active' ? 'text-emerald-400' : s === 'reserved' ? 'text-amber-400' : 'text-faint'
}
</script>

<template>
  <div>
    <PageHeader title="Customers" subtitle="Tenants and organizations owning subnets, VLANs, VRFs, addresses, and devices" icon="i-lucide-building-2">
      <template v-if="hasApp('ipmgt') && canCreate" #actions>
        <UButton icon="i-lucide-plus" size="sm" @click="openCreate">Add Customer</UButton>
      </template>
    </PageHeader>

    <div v-if="!hasApp('ipmgt')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-IPMgt.</p>
    </div>

    <DataState v-else :status="status" :error="error" :empty="!customers.length" empty-label="No customers yet." empty-icon="i-lucide-building-2">
      <template #empty-action>
        <UButton v-if="canCreate" class="mt-3" icon="i-lucide-plus" size="sm" @click="openCreate">Add Customer</UButton>
      </template>
      <div class="panel overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="bg-surface-2 text-xs uppercase text-faint">
            <tr>
              <th class="px-4 py-3 font-medium">Name</th>
              <th class="px-4 py-3 font-medium">Contact</th>
              <th class="px-4 py-3 font-medium">City / Country</th>
              <th class="px-4 py-3 font-medium">Linked</th>
              <th class="px-4 py-3 font-medium">Status</th>
              <th class="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-surface">
            <tr v-for="c in customers" :key="c.id" class="hover:bg-surface-2/40">
              <td class="px-4 py-3 font-medium text-foam">{{ c.name }}</td>
              <td class="px-4 py-3 text-(--color-muted)">{{ c.contact_person || c.email || '—' }}</td>
              <td class="px-4 py-3 text-(--color-muted)">{{ [c.city, c.country].filter(Boolean).join(', ') || '—' }}</td>
              <td class="px-4 py-3 text-(--color-muted)">{{ c.subnet_count + c.vlan_count + c.vrf_count + c.address_count + c.device_count }}</td>
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

    <UModal v-model:open="dialog.open" :title="dialog.editing ? 'Edit customer' : 'Add customer'" :ui="{ content: 'max-w-2xl' }">
      <template #body>
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Name" required>
              <UInput v-model="form.name" placeholder="Acme Corp" class="w-full" />
            </UFormField>
            <UFormField label="Status">
              <USelect v-model="form.status" :items="STATUS_ITEMS" value-key="value" label-key="label" class="w-full" />
            </UFormField>
          </div>
          <div class="grid grid-cols-3 gap-4">
            <UFormField label="Contact person">
              <UInput v-model="form.contact_person" class="w-full" />
            </UFormField>
            <UFormField label="Phone">
              <UInput v-model="form.phone" class="w-full" />
            </UFormField>
            <UFormField label="Email">
              <UInput v-model="form.email" type="email" class="w-full" />
            </UFormField>
          </div>
          <UFormField label="Address">
            <UInput v-model="form.address" class="w-full" />
          </UFormField>
          <div class="grid grid-cols-3 gap-4">
            <UFormField label="City">
              <UInput v-model="form.city" class="w-full" />
            </UFormField>
            <UFormField label="State / Province">
              <UInput v-model="form.state" class="w-full" />
            </UFormField>
            <UFormField label="Postal code">
              <UInput v-model="form.postal_code" class="w-full" />
            </UFormField>
          </div>
          <UFormField label="Country">
            <UInput v-model="form.country" class="w-full" />
          </UFormField>
          <UFormField label="Notes">
            <UTextarea v-model="form.notes" class="w-full" :rows="2" />
          </UFormField>
          <IpamCustomFieldsPanel ref="cfRef" entity-type="customer" :entity-id="dialog.editing?.id || null" />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-3">
          <UButton variant="ghost" @click="dialog.open = false">Cancel</UButton>
          <UButton color="primary" :loading="saving" :disabled="!form.name.trim()" @click="save">{{ dialog.editing ? 'Save' : 'Create' }}</UButton>
        </div>
      </template>
    </UModal>

    <ConfirmPasswordModal
      :open="!!deleteTarget"
      @update:open="(v: boolean) => { if (!v) deleteTarget = null }"
      title="Delete customer"
      :message="deleteTarget ? `Customer ${deleteTarget.name} will be permanently removed.` : ''"
      confirm-label="Delete"
      :action="confirmDelete"
    />
  </div>
</template>
