<script setup lang="ts">
// Racks: physical rack inventory. Click through to a rack for its elevation view.
const { hasApp } = useAuth()
const { canCreate, canUpdate, canDelete } = useIpam()
const toast = useToast()

const { data: racks, status, error, refresh } = useAsyncData('ipamRacks', () => $fetch<any[]>('/api/ipmgt/racks'), { server: false, default: () => [] })
const { data: locations } = useAsyncData('ipamRefLocations', () => $fetch<any[]>('/api/ipmgt/locations'), { server: false, default: () => [] })
const locationItems = computed(() => [{ value: '', label: '— None —' }, ...(locations.value || []).map((l: any) => ({ value: l.id, label: l.name }))])

const emptyForm = () => ({ name: '', description: '', location_id: '', room: '', row_name: '', size_u: 42, starting_unit: 1, orientation: 'top-down', active: true, notes: '' })
const dialog = reactive({ open: false, editing: null as any })
const form = reactive(emptyForm())
const saving = ref(false)
function openCreate() { dialog.editing = null; Object.assign(form, emptyForm()); dialog.open = true }
function openEdit(r: any) {
  dialog.editing = r
  Object.assign(form, {
    name: r.name, description: r.description || '', location_id: r.location_id || '', room: r.room || '',
    row_name: r.row_name || '', size_u: r.size_u, starting_unit: r.starting_unit, orientation: r.orientation,
    active: !!r.active, notes: r.notes || ''
  })
  dialog.open = true
}
async function save() {
  if (!form.name.trim()) return
  saving.value = true
  try {
    const body = { ...form, location_id: form.location_id || null }
    if (dialog.editing) await $fetch(`/api/ipmgt/racks/${dialog.editing.id}`, { method: 'PUT', body })
    else await $fetch('/api/ipmgt/racks', { method: 'POST', body })
    toast.add({ title: dialog.editing ? 'Rack updated' : 'Rack created', color: 'primary', icon: 'i-lucide-check' })
    dialog.open = false
    await refresh()
  } catch (e: any) { toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' }) }
  finally { saving.value = false }
}

const deleteTarget = ref<any | null>(null)
async function confirmDelete(password: string) {
  const r = deleteTarget.value
  if (!r) return
  await $fetch(`/api/ipmgt/racks/${r.id}`, { method: 'DELETE', headers: { 'x-confirm-password': password } })
  toast.add({ title: 'Rack deleted', color: 'primary', icon: 'i-lucide-check' })
  deleteTarget.value = null
  await refresh()
}
</script>

<template>
  <div>
    <PageHeader title="Racks" subtitle="Physical rack inventory and elevation" icon="i-lucide-server-cog">
      <template v-if="hasApp('ipmgt') && canCreate" #actions>
        <UButton icon="i-lucide-plus" size="sm" @click="openCreate">Add Rack</UButton>
      </template>
    </PageHeader>

    <div v-if="!hasApp('ipmgt')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-IPMgt.</p>
    </div>

    <DataState v-else :status="status" :error="error" :empty="!racks.length" empty-label="No racks yet." empty-icon="i-lucide-server-cog">
      <template #empty-action>
        <UButton v-if="canCreate" class="mt-3" icon="i-lucide-plus" size="sm" @click="openCreate">Add Rack</UButton>
      </template>
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div v-for="r in racks" :key="r.id" class="panel flex gap-4 p-5">
          <NuxtLink :to="`/ipmgt/racks/${r.id}`" :title="`Open ${r.name} elevation`" class="transition hover:brightness-125">
            <IpamRackMiniDiagram :rack="r" />
          </NuxtLink>
          <div class="min-w-0 flex-1 space-y-3">
            <div class="flex items-start justify-between">
              <div class="min-w-0">
                <NuxtLink :to="`/ipmgt/racks/${r.id}`" class="font-medium text-foam hover:text-beacon">{{ r.name }}</NuxtLink>
                <p class="text-xs text-faint">{{ r.location_name || 'No location' }}<span v-if="r.room"> · {{ r.room }}</span></p>
              </div>
              <div class="flex items-center gap-1">
                <UButton v-if="canUpdate" size="xs" variant="ghost" icon="i-lucide-pencil" aria-label="Edit" @click="openEdit(r)" />
                <UButton v-if="canDelete" size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" aria-label="Delete" @click="deleteTarget = r" />
              </div>
            </div>
            <div class="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
              <div class="h-full rounded-full" :class="usageBarClass(Math.round((r.used_u / r.size_u) * 100))" :style="{ width: `${Math.min(100, Math.round((r.used_u / r.size_u) * 100))}%` }" />
            </div>
            <p class="text-xs text-faint">{{ r.used_u }}/{{ r.size_u }}U used · {{ r.item_count }} item(s)</p>
            <NuxtLink :to="`/ipmgt/racks/${r.id}`" class="inline-flex items-center gap-1 text-xs text-beacon hover:underline">
              <UIcon name="i-lucide-layout-panel-top" class="size-3.5" /> View rack diagram
            </NuxtLink>
          </div>
        </div>
      </div>
    </DataState>

    <UModal v-model:open="dialog.open" :title="dialog.editing ? 'Edit rack' : 'Add rack'" :ui="{ content: 'max-w-xl' }">
      <template #body>
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Name" required>
              <UInput v-model="form.name" placeholder="Rack A1" class="w-full" />
            </UFormField>
            <UFormField label="Location">
              <USelect v-model="form.location_id" :items="locationItems" value-key="value" label-key="label" class="w-full" />
            </UFormField>
          </div>
          <div class="grid grid-cols-3 gap-4">
            <UFormField label="Room">
              <UInput v-model="form.room" class="w-full" />
            </UFormField>
            <UFormField label="Row">
              <UInput v-model="form.row_name" class="w-full" />
            </UFormField>
            <UFormField label="Orientation">
              <USelect v-model="form.orientation" :items="[{ value: 'top-down', label: 'Top-down' }, { value: 'bottom-up', label: 'Bottom-up' }]" value-key="value" label-key="label" class="w-full" />
            </UFormField>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Size (U)" required>
              <UInput v-model.number="form.size_u" type="number" min="1" max="200" class="w-full" />
            </UFormField>
            <UFormField label="Starting unit">
              <UInput v-model.number="form.starting_unit" type="number" min="1" class="w-full" />
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

    <ConfirmPasswordModal
      :open="!!deleteTarget"
      @update:open="(v: boolean) => { if (!v) deleteTarget = null }"
      title="Delete rack"
      :message="deleteTarget ? `Rack ${deleteTarget.name} and every item placed in it will be permanently removed.` : ''"
      confirm-label="Delete"
      :action="confirmDelete"
    />
  </div>
</template>
