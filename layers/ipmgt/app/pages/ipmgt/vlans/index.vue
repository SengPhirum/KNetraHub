<script setup lang="ts">
// VLANs: id (1-4094), name, L2 domain, with attached-subnet counts + CRUD.
const { hasApp } = useAuth()
const { canCreate, canUpdate, canDelete } = useIpam()
const toast = useToast()

const { data: vlans, status, error, refresh } = useAsyncData('ipamVlans', () => $fetch<any[]>('/api/ipmgt/vlans'), { server: false, default: () => [] })
const { data: domains } = useAsyncData('ipamL2Domains', () => $fetch<any[]>('/api/ipmgt/l2domains'), { server: false, default: () => [] })
const { data: locations } = useAsyncData('ipamRefLocations', () => $fetch<any[]>('/api/ipmgt/locations'), { server: false, default: () => [] })
const { data: customers } = useAsyncData('ipamRefCustomers', () => $fetch<any[]>('/api/ipmgt/customers'), { server: false, default: () => [] })
const domainItems = computed(() => [{ value: '', label: '— None —' }, ...(domains.value || []).map((d: any) => ({ value: d.id, label: d.name }))])
const locationItems = computed(() => [{ value: '', label: '— None —' }, ...(locations.value || []).map((l: any) => ({ value: l.id, label: l.name }))])
const customerItems = computed(() => [{ value: '', label: '— None —' }, ...(customers.value || []).map((c: any) => ({ value: c.id, label: c.name }))])

const q = ref('')
const filtered = computed(() => {
  const s = q.value.toLowerCase().trim()
  if (!s) return vlans.value || []
  return (vlans.value || []).filter((v: any) => String(v.vlan_id).includes(s) || (v.name || '').toLowerCase().includes(s))
})

const dialog = reactive({ open: false, editing: null as any })
const form = reactive({ vlan_id: 1, name: '', description: '', l2domain_id: '', location: '', location_id: '', customer_id: '', active: true })
const saving = ref(false)
const cfRef = ref()
function openCreate() { dialog.editing = null; Object.assign(form, { vlan_id: 1, name: '', description: '', l2domain_id: '', location: '', location_id: '', customer_id: '', active: true }); dialog.open = true }
function openEdit(v: any) { dialog.editing = v; Object.assign(form, { vlan_id: v.vlan_id, name: v.name, description: v.description || '', l2domain_id: v.l2domain_id || '', location: v.location || '', location_id: v.location_id || '', customer_id: v.customer_id || '', active: !!v.active }); dialog.open = true }
async function save() {
  if (!form.name.trim()) return
  saving.value = true
  try {
    const body = { ...form, l2domain_id: form.l2domain_id || null, location_id: form.location_id || null, customer_id: form.customer_id || null }
    let id = dialog.editing?.id
    if (dialog.editing) await $fetch(`/api/ipmgt/vlans/${dialog.editing.id}`, { method: 'PUT', body })
    else { const res: any = await $fetch('/api/ipmgt/vlans', { method: 'POST', body }); id = res.id }
    await cfRef.value?.saveValues(id)
    toast.add({ title: dialog.editing ? 'VLAN updated' : 'VLAN created', color: 'primary', icon: 'i-lucide-check' })
    dialog.open = false
    await refresh()
  } catch (e: any) { toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' }) }
  finally { saving.value = false }
}

const deleteTarget = ref<any>(null)
async function confirmDelete(password: string) {
  if (!deleteTarget.value) return
  await $fetch(`/api/ipmgt/vlans/${deleteTarget.value.id}`, { method: 'DELETE', headers: { 'x-confirm-password': password } })
  toast.add({ title: 'VLAN deleted', color: 'primary', icon: 'i-lucide-check' })
  deleteTarget.value = null
  await refresh()
}
</script>

<template>
  <div>
    <PageHeader title="VLANs" subtitle="Layer-2 VLANs and their domains" icon="i-lucide-layers">
      <template v-if="hasApp('ipmgt') && canCreate" #actions>
        <UButton icon="i-lucide-plus" size="sm" @click="openCreate">Add VLAN</UButton>
      </template>
    </PageHeader>

    <div v-if="!hasApp('ipmgt')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-IPMgt.</p>
    </div>

    <div v-else class="space-y-4">
      <UInput v-model="q" icon="i-lucide-search" size="sm" placeholder="Search VLAN id or name…" class="w-64" />
      <DataState :status="status" :error="error" :empty="!filtered.length" empty-label="No VLANs yet." empty-icon="i-lucide-layers">
        <template #empty-action>
          <UButton v-if="canCreate" class="mt-3" icon="i-lucide-plus" size="sm" @click="openCreate">Add VLAN</UButton>
        </template>
        <div class="panel overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="bg-surface-2 text-xs uppercase text-faint">
              <tr>
                <th class="px-4 py-3 font-medium">VLAN ID</th>
                <th class="px-4 py-3 font-medium">Name</th>
                <th class="px-4 py-3 font-medium">L2 domain</th>
                <th class="px-4 py-3 font-medium">Subnets</th>
                <th class="px-4 py-3 font-medium">Status</th>
                <th class="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-surface">
              <tr v-for="v in filtered" :key="v.id" class="hover:bg-surface-2/40">
                <td class="px-4 py-3 font-mono font-medium text-foam">{{ v.vlan_id }}</td>
                <td class="px-4 py-3 text-(--color-muted)">{{ v.name }}</td>
                <td class="px-4 py-3 text-(--color-muted)">{{ v.l2domain_name || '—' }}</td>
                <td class="px-4 py-3 text-(--color-muted)">{{ v.subnet_count }}</td>
                <td class="px-4 py-3"><span class="text-xs" :class="v.active ? 'text-emerald-400' : 'text-faint'">{{ v.active ? 'Active' : 'Inactive' }}</span></td>
                <td class="px-4 py-3">
                  <div class="flex items-center justify-end gap-1">
                    <UButton v-if="canUpdate" size="xs" variant="ghost" icon="i-lucide-pencil" aria-label="Edit" @click="openEdit(v)" />
                    <UButton v-if="canDelete" size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" aria-label="Delete" @click="deleteTarget = v" />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </DataState>
    </div>

    <UModal v-model:open="dialog.open" :title="dialog.editing ? 'Edit VLAN' : 'Add VLAN'">
      <template #body>
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="VLAN ID (1-4094)" required>
              <UInput v-model.number="form.vlan_id" type="number" min="1" max="4094" class="w-full" />
            </UFormField>
            <UFormField label="Name" required>
              <UInput v-model="form.name" class="w-full" />
            </UFormField>
          </div>
          <UFormField label="L2 domain">
            <USelect v-model="form.l2domain_id" :items="domainItems" value-key="value" label-key="label" class="w-full" />
          </UFormField>
          <UFormField label="Location">
            <UInput v-model="form.location" class="w-full" />
          </UFormField>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Location record" help="Linked location, if one has been added">
              <USelect v-model="form.location_id" :items="locationItems" value-key="value" label-key="label" class="w-full" />
            </UFormField>
            <UFormField label="Customer">
              <USelect v-model="form.customer_id" :items="customerItems" value-key="value" label-key="label" class="w-full" />
            </UFormField>
          </div>
          <UFormField label="Description">
            <UTextarea v-model="form.description" class="w-full" :rows="2" />
          </UFormField>
          <UCheckbox v-model="form.active" label="Active" />
          <IpamCustomFieldsPanel ref="cfRef" entity-type="vlan" :entity-id="dialog.editing?.id || null" />
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
      title="Delete VLAN"
      :message="deleteTarget ? `VLAN ${deleteTarget.vlan_id} will be removed. Subnets referencing it are detached, not deleted.` : ''"
      confirm-label="Delete"
      :action="confirmDelete"
    />
  </div>
</template>
