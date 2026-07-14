<script setup lang="ts">
// VRFs: named routing tables that permit overlapping subnet space across VRFs.
const { hasApp } = useAuth()
const { canCreate, canUpdate, canDelete } = useIpam()
const toast = useToast()

const { data: vrfs, status, error, refresh } = useAsyncData('ipamVrfs', () => $fetch<any[]>('/api/ipmgt/vrfs'), { server: false, default: () => [] })
const { data: locations } = useAsyncData('ipamRefLocations', () => $fetch<any[]>('/api/ipmgt/locations'), { server: false, default: () => [] })
const { data: customers } = useAsyncData('ipamRefCustomers', () => $fetch<any[]>('/api/ipmgt/customers'), { server: false, default: () => [] })
const locationItems = computed(() => [{ value: '', label: '— None —' }, ...(locations.value || []).map((l: any) => ({ value: l.id, label: l.name }))])
const customerItems = computed(() => [{ value: '', label: '— None —' }, ...(customers.value || []).map((c: any) => ({ value: c.id, label: c.name }))])

const dialog = reactive({ open: false, editing: null as any })
const form = reactive({ name: '', rd: '', description: '', owner: '', location: '', location_id: '', customer_id: '', active: true })
const saving = ref(false)
function openCreate() { dialog.editing = null; Object.assign(form, { name: '', rd: '', description: '', owner: '', location: '', location_id: '', customer_id: '', active: true }); dialog.open = true }
function openEdit(v: any) { dialog.editing = v; Object.assign(form, { name: v.name, rd: v.rd || '', description: v.description || '', owner: v.owner || '', location: v.location || '', location_id: v.location_id || '', customer_id: v.customer_id || '', active: !!v.active }); dialog.open = true }
async function save() {
  if (!form.name.trim()) return
  saving.value = true
  try {
    const body = { ...form, location_id: form.location_id || null, customer_id: form.customer_id || null }
    if (dialog.editing) await $fetch(`/api/ipmgt/vrfs/${dialog.editing.id}`, { method: 'PUT', body })
    else await $fetch('/api/ipmgt/vrfs', { method: 'POST', body })
    toast.add({ title: dialog.editing ? 'VRF updated' : 'VRF created', color: 'primary', icon: 'i-lucide-check' })
    dialog.open = false
    await refresh()
  } catch (e: any) { toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' }) }
  finally { saving.value = false }
}

const deleteTarget = ref<any>(null)
const deleting = ref(false)
async function confirmDelete() {
  if (!deleteTarget.value) return
  deleting.value = true
  try {
    await $fetch(`/api/ipmgt/vrfs/${deleteTarget.value.id}`, { method: 'DELETE' })
    toast.add({ title: 'VRF deleted', color: 'primary', icon: 'i-lucide-check' })
    deleteTarget.value = null
    await refresh()
  } catch (e: any) { toast.add({ title: 'Delete failed', description: e?.data?.statusMessage, color: 'error' }) }
  finally { deleting.value = false }
}
</script>

<template>
  <div>
    <PageHeader title="VRFs" subtitle="Virtual routing & forwarding instances" icon="i-lucide-git-fork">
      <template v-if="hasApp('ipmgt') && canCreate" #actions>
        <UButton icon="i-lucide-plus" size="sm" @click="openCreate">Add VRF</UButton>
      </template>
    </PageHeader>

    <div v-if="!hasApp('ipmgt')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-IPMgt.</p>
    </div>

    <DataState v-else :status="status" :error="error" :empty="!vrfs.length" empty-label="No VRFs yet." empty-icon="i-lucide-git-fork">
      <template #empty-action>
        <UButton v-if="canCreate" class="mt-3" icon="i-lucide-plus" size="sm" @click="openCreate">Add VRF</UButton>
      </template>
      <div class="panel overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="bg-surface-2 text-xs uppercase text-faint">
            <tr>
              <th class="px-4 py-3 font-medium">Name</th>
              <th class="px-4 py-3 font-medium">RD</th>
              <th class="px-4 py-3 font-medium">Owner</th>
              <th class="px-4 py-3 font-medium">Subnets</th>
              <th class="px-4 py-3 font-medium">Status</th>
              <th class="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-surface">
            <tr v-for="v in vrfs" :key="v.id" class="hover:bg-surface-2/40">
              <td class="px-4 py-3 font-medium text-foam">{{ v.name }}</td>
              <td class="px-4 py-3 font-mono text-xs text-(--color-muted)">{{ v.rd || '—' }}</td>
              <td class="px-4 py-3 text-(--color-muted)">{{ v.owner || '—' }}</td>
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

    <UModal v-model:open="dialog.open" :title="dialog.editing ? 'Edit VRF' : 'Add VRF'">
      <template #body>
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Name" required>
              <UInput v-model="form.name" placeholder="customer-a" class="w-full" />
            </UFormField>
            <UFormField label="Route distinguisher">
              <UInput v-model="form.rd" placeholder="65000:100" class="w-full font-mono" />
            </UFormField>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Owner / department">
              <UInput v-model="form.owner" class="w-full" />
            </UFormField>
            <UFormField label="Location">
              <UInput v-model="form.location" class="w-full" />
            </UFormField>
          </div>
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
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-3">
          <UButton variant="ghost" @click="dialog.open = false">Cancel</UButton>
          <UButton color="primary" :loading="saving" :disabled="!form.name.trim()" @click="save">{{ dialog.editing ? 'Save' : 'Create' }}</UButton>
        </div>
      </template>
    </UModal>

    <UModal :open="!!deleteTarget" @update:open="(v: boolean) => { if (!v) deleteTarget = null }" title="Delete VRF">
      <template #body>
        <p class="text-sm text-(--color-muted)">Delete VRF <span class="font-medium text-foam">{{ deleteTarget?.name }}</span>? Subnets in it are detached, not deleted.</p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-3">
          <UButton variant="ghost" @click="deleteTarget = null">Cancel</UButton>
          <UButton color="error" :loading="deleting" @click="confirmDelete">Delete</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
