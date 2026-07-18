<script setup lang="ts">
// Locations — list + full CRUD (admin tier). sysLocation-derived rows are
// editable too; editing one marks it manually managed.
const { hasMonitoring, canManage } = useMonitoring()
const toast = useToast()

const page = ref(1)
const { data, status, refresh } = useAsyncData('monLocations',
  () => $fetch<any>(`/api/monitoring/v1/locations?page=${page.value}&per_page=50`),
  { server: false, default: () => ({ items: [], total: 0 }), watch: [page] })
const totalPages = computed(() => Math.max(1, Math.ceil((data.value?.total ?? 0) / 50)))

const form = reactive({ name: '', latitude: '', longitude: '' })
const editingId = ref<number | null>(null)
const modalOpen = ref(false)
const saving = ref(false)

function openCreate() {
  editingId.value = null
  Object.assign(form, { name: '', latitude: '', longitude: '' })
  modalOpen.value = true
}
function openEdit(l: any) {
  editingId.value = l.id
  Object.assign(form, { name: l.name, latitude: l.latitude ?? '', longitude: l.longitude ?? '' })
  modalOpen.value = true
}

async function save() {
  saving.value = true
  try {
    const body = {
      name: form.name,
      latitude: form.latitude === '' ? null : Number(form.latitude),
      longitude: form.longitude === '' ? null : Number(form.longitude)
    }
    if (editingId.value) {
      await $fetch(`/api/monitoring/v1/locations/${editingId.value}`, { method: 'PUT', body })
      toast.add({ title: 'Location updated', color: 'primary', icon: 'i-lucide-check' })
    } else {
      await $fetch('/api/monitoring/v1/locations', { method: 'POST', body })
      toast.add({ title: 'Location created', color: 'primary', icon: 'i-lucide-check' })
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
    await $fetch(`/api/monitoring/v1/locations/${deleteTarget.value.id}`, { method: 'DELETE' })
    toast.add({ title: 'Location deleted', color: 'primary', icon: 'i-lucide-check' })
    deleteTarget.value = null
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Delete failed', description: e?.data?.statusMessage, color: 'error' })
  } finally { deleting.value = false }
}
</script>

<template>
  <div>
    <PageHeader title="Locations" subtitle="Geographic and logical sites" icon="i-lucide-map-pin">
      <template v-if="hasMonitoring && canManage" #actions>
        <UButton icon="i-lucide-plus" size="sm" @click="openCreate">Add location</UButton>
      </template>
    </PageHeader>

    <div v-if="!hasMonitoring" class="panel p-10 text-center text-muted">No access to the Monitoring app.</div>
    <div v-else class="space-y-4">
      <div class="panel overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-surface-2 text-left text-xs uppercase text-faint">
            <tr><th class="px-3 py-2">Location</th><th class="px-3 py-2 text-right">Devices</th>
              <th class="px-3 py-2 text-right">Latitude</th><th class="px-3 py-2 text-right">Longitude</th>
              <th class="px-3 py-2">Source</th><th v-if="canManage" class="px-3 py-2" /></tr>
          </thead>
          <tbody>
            <tr v-if="status === 'pending'"><td colspan="6" class="px-3 py-8 text-center text-muted">Loading…</td></tr>
            <tr v-else-if="!data.items?.length"><td colspan="6" class="px-3 py-8 text-center text-muted">No locations yet — they appear automatically from device sysLocation, or add one manually.</td></tr>
            <tr v-for="l in data.items" :key="l.id" class="border-t border-hull">
              <td class="px-3 py-2 font-medium">{{ l.name }}</td>
              <td class="px-3 py-2 text-right">{{ l.device_count }}</td>
              <td class="px-3 py-2 text-right text-muted">{{ l.latitude ?? '—' }}</td>
              <td class="px-3 py-2 text-right text-muted">{{ l.longitude ?? '—' }}</td>
              <td class="px-3 py-2 text-xs text-faint">{{ l.from_sys_location ? 'sysLocation' : 'manual' }}</td>
              <td v-if="canManage" class="px-3 py-2 text-right whitespace-nowrap">
                <UButton size="xs" variant="ghost" icon="i-lucide-pencil" @click="openEdit(l)" />
                <UButton size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" @click="deleteTarget = l" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="totalPages > 1" class="flex items-center justify-center gap-2">
        <UButton size="xs" :disabled="page <= 1" @click="page--">Prev</UButton>
        <span class="text-sm text-muted">{{ page }} / {{ totalPages }}</span>
        <UButton size="xs" :disabled="page >= totalPages" @click="page++">Next</UButton>
      </div>
    </div>

    <UModal v-model:open="modalOpen" :title="editingId ? 'Edit location' : 'Add location'">
      <template #body>
        <div class="space-y-3">
          <UFormField label="Name" required><UInput v-model="form.name" placeholder="Phnom Penh DC1" class="w-full" /></UFormField>
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Latitude" description="-90 to 90 (optional)">
              <UInput v-model="form.latitude" type="number" step="any" placeholder="11.5564" class="w-full" />
            </UFormField>
            <UFormField label="Longitude" description="-180 to 180 (optional)">
              <UInput v-model="form.longitude" type="number" step="any" placeholder="104.9282" class="w-full" />
            </UFormField>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" @click="modalOpen = false">Cancel</UButton>
          <UButton :loading="saving" :disabled="!form.name" @click="save">{{ editingId ? 'Save' : 'Add location' }}</UButton>
        </div>
      </template>
    </UModal>

    <UModal :open="!!deleteTarget" title="Delete location" @update:open="(v) => !v && (deleteTarget = null)">
      <template #body>
        <p class="text-sm text-muted">
          Delete <strong>{{ deleteTarget?.name }}</strong>?
          {{ deleteTarget?.device_count ? `${deleteTarget.device_count} device(s) keep running with no location.` : 'No devices reference it.' }}
        </p>
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
