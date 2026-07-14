<script setup lang="ts">
// Locations: physical sites (data centers, offices, buildings) that subnets,
// VLANs, VRFs, and devices can be linked to.
const { hasApp } = useAuth()
const { canCreate, canUpdate, canDelete } = useIpam()
const toast = useToast()

const { data: locations, status, error, refresh } = useAsyncData('ipamLocations', () => $fetch<any[]>('/api/ipmgt/locations'), { server: false, default: () => [] })

const parentItems = computed(() => [
  { value: '', label: '— None —' },
  ...(locations.value || []).map((l: any) => ({ value: l.id, label: l.name }))
])

const emptyForm = () => ({
  name: '', description: '', address: '', city: '', state: '', postal_code: '', country: '',
  latitude: '', longitude: '', parent_id: '', location_type: '',
  contact_name: '', contact_email: '', contact_phone: '', active: true
})

const dialog = reactive({ open: false, editing: null as any })
const form = reactive(emptyForm())
const saving = ref(false)
const cfRef = ref()
function openCreate() { dialog.editing = null; Object.assign(form, emptyForm()); dialog.open = true }
function openEdit(l: any) {
  dialog.editing = l
  Object.assign(form, {
    name: l.name, description: l.description || '', address: l.address || '', city: l.city || '',
    state: l.state || '', postal_code: l.postal_code || '', country: l.country || '',
    latitude: l.latitude ?? '', longitude: l.longitude ?? '', parent_id: l.parent_id || '',
    location_type: l.location_type || '', contact_name: l.contact_name || '',
    contact_email: l.contact_email || '', contact_phone: l.contact_phone || '', active: !!l.active
  })
  dialog.open = true
}
async function save() {
  if (!form.name.trim()) return
  saving.value = true
  try {
    const body = { ...form, parent_id: form.parent_id || null, latitude: form.latitude === '' ? null : form.latitude, longitude: form.longitude === '' ? null : form.longitude }
    let id = dialog.editing?.id
    if (dialog.editing) await $fetch(`/api/ipmgt/locations/${dialog.editing.id}`, { method: 'PUT', body })
    else { const res: any = await $fetch('/api/ipmgt/locations', { method: 'POST', body }); id = res.id }
    await cfRef.value?.saveValues(id)
    toast.add({ title: dialog.editing ? 'Location updated' : 'Location created', color: 'primary', icon: 'i-lucide-check' })
    dialog.open = false
    await refresh()
  } catch (e: any) { toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' }) }
  finally { saving.value = false }
}

const deleteTarget = ref<any | null>(null)
async function confirmDelete(password: string) {
  const l = deleteTarget.value
  if (!l) return
  await $fetch(`/api/ipmgt/locations/${l.id}`, { method: 'DELETE', headers: { 'x-confirm-password': password } })
  toast.add({ title: 'Location deleted', color: 'primary', icon: 'i-lucide-check' })
  deleteTarget.value = null
  await refresh()
}
</script>

<template>
  <div>
    <PageHeader title="Locations" subtitle="Physical sites subnets, VLANs, VRFs, and devices can be linked to" icon="i-lucide-map-pin">
      <template v-if="hasApp('ipmgt') && canCreate" #actions>
        <UButton icon="i-lucide-plus" size="sm" @click="openCreate">Add Location</UButton>
      </template>
    </PageHeader>

    <div v-if="!hasApp('ipmgt')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-IPMgt.</p>
    </div>

    <DataState v-else :status="status" :error="error" :empty="!locations.length" empty-label="No locations yet." empty-icon="i-lucide-map-pin">
      <template #empty-action>
        <UButton v-if="canCreate" class="mt-3" icon="i-lucide-plus" size="sm" @click="openCreate">Add Location</UButton>
      </template>
      <div class="panel overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="bg-surface-2 text-xs uppercase text-faint">
            <tr>
              <th class="px-4 py-3 font-medium">Name</th>
              <th class="px-4 py-3 font-medium">Type</th>
              <th class="px-4 py-3 font-medium">City / Country</th>
              <th class="px-4 py-3 font-medium">Parent</th>
              <th class="px-4 py-3 font-medium">Linked</th>
              <th class="px-4 py-3 font-medium">Status</th>
              <th class="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-surface">
            <tr v-for="l in locations" :key="l.id" class="hover:bg-surface-2/40">
              <td class="px-4 py-3 font-medium text-foam">{{ l.name }}</td>
              <td class="px-4 py-3 text-(--color-muted)">{{ l.location_type || '—' }}</td>
              <td class="px-4 py-3 text-(--color-muted)">{{ [l.city, l.country].filter(Boolean).join(', ') || '—' }}</td>
              <td class="px-4 py-3 text-(--color-muted)">{{ l.parent_name || '—' }}</td>
              <td class="px-4 py-3 text-(--color-muted)">{{ l.subnet_count + l.vlan_count + l.vrf_count + l.device_count }}</td>
              <td class="px-4 py-3"><span class="text-xs" :class="l.active ? 'text-emerald-400' : 'text-faint'">{{ l.active ? 'Active' : 'Inactive' }}</span></td>
              <td class="px-4 py-3">
                <div class="flex items-center justify-end gap-1">
                  <UButton v-if="canUpdate" size="xs" variant="ghost" icon="i-lucide-pencil" aria-label="Edit" @click="openEdit(l)" />
                  <UButton v-if="canDelete" size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" aria-label="Delete" @click="deleteTarget = l" />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </DataState>

    <UModal v-model:open="dialog.open" :title="dialog.editing ? 'Edit location' : 'Add location'" :ui="{ content: 'max-w-2xl' }">
      <template #body>
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Name" required>
              <UInput v-model="form.name" placeholder="Primary Data Center" class="w-full" />
            </UFormField>
            <UFormField label="Type">
              <UInput v-model="form.location_type" placeholder="Data Center / Office / Rack" class="w-full" />
            </UFormField>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Parent location">
              <USelect v-model="form.parent_id" :items="parentItems" value-key="value" label-key="label" class="w-full" />
            </UFormField>
            <UFormField label="Address">
              <UInput v-model="form.address" class="w-full" />
            </UFormField>
          </div>
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
          <div class="grid grid-cols-3 gap-4">
            <UFormField label="Country">
              <UInput v-model="form.country" class="w-full" />
            </UFormField>
            <UFormField label="Latitude">
              <UInput v-model="form.latitude" type="number" step="any" class="w-full" />
            </UFormField>
            <UFormField label="Longitude">
              <UInput v-model="form.longitude" type="number" step="any" class="w-full" />
            </UFormField>
          </div>
          <div class="grid grid-cols-3 gap-4">
            <UFormField label="Contact name">
              <UInput v-model="form.contact_name" class="w-full" />
            </UFormField>
            <UFormField label="Contact email">
              <UInput v-model="form.contact_email" type="email" class="w-full" />
            </UFormField>
            <UFormField label="Contact phone">
              <UInput v-model="form.contact_phone" class="w-full" />
            </UFormField>
          </div>
          <UFormField label="Description">
            <UTextarea v-model="form.description" class="w-full" :rows="2" />
          </UFormField>
          <UCheckbox v-model="form.active" label="Active" />
          <IpamCustomFieldsPanel ref="cfRef" entity-type="location" :entity-id="dialog.editing?.id || null" />
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
      title="Delete location"
      :message="deleteTarget ? `Location ${deleteTarget.name} will be permanently removed.` : ''"
      confirm-label="Delete"
      :action="confirmDelete"
    />
  </div>
</template>
