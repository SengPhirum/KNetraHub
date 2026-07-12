<script setup lang="ts">
const { can } = useAuth()
const { relative } = useFormat()
const toast = useToast()
const { data, status, error, refresh } = await useFetch('/api/volumes', { lazy: true })
const volumeSortOptions = [
  { label: 'Name', value: 'name' },
  { label: 'Driver', value: 'driver' },
  { label: 'Scope', value: 'scope' },
  { label: 'Created', value: 'created' },
  { label: 'Mountpoint', value: 'mountpoint' }
]
const volumeFilterOptions = [
  { key: 'driver', label: 'Driver', getValue: (v: any) => v.driver },
  { key: 'scope', label: 'Scope', getValue: (v: any) => v.scope }
]
const { items: filtered, search, sortBy, sortDir, sortOptions, filters, facets } = useListControls('volumes', data, {
  sortOptions: volumeSortOptions,
  defaultSortBy: 'name',
  filterOptions: volumeFilterOptions
})

const open = ref(false)
const form = reactive({ name: '', driver: 'local' })
function openCreate() { Object.assign(form, { name: '', driver: 'local' }); open.value = true }
async function create() {
  if (!form.name) { toast.add({ title: 'Name required', color: 'warning' }); return }
  try {
    await $fetch('/api/volumes', { method: 'POST', body: { ...form } })
    toast.add({ title: `Created ${form.name}`, color: 'primary', icon: 'i-lucide-database' })
    open.value = false
    setTimeout(refresh, 500)
  } catch (e: any) { toast.add({ title: 'Create failed', description: e?.data?.statusMessage, color: 'error' }) }
}
// Deleting a volume destroys its data - it must be confirmed with the user's
// password (enforced server-side, see requirePasswordConfirm).
const removeTarget = ref<any | null>(null)
function remove(v: any) {
  removeTarget.value = v
}
async function confirmRemove(password: string) {
  const v = removeTarget.value
  if (!v) return
  await $fetch(`/api/volumes/${encodeURIComponent(v.name)}?force=true`, { method: 'DELETE', headers: { 'x-confirm-password': password } })
  toast.add({ title: `Deleted ${v.name}`, color: 'primary' })
  refresh()
}

function openVolume(v: any) {
  navigateTo(`/volumes/${encodeURIComponent(v.name)}`)
}
</script>

<template>
  <div>
    <PageHeader title="Volumes" subtitle="Persistent data volumes" icon="i-lucide-database">
      <template #actions>
        <ListControls
          inline
          v-model:search="search"
          v-model:sort-by="sortBy"
          v-model:sort-dir="sortDir"
          v-model:filters="filters"
          :sort-options="sortOptions"
          :facets="facets"
          placeholder="Search volumes"
        />
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" @click="refresh()" />
        <UButton v-if="can('operator')" icon="i-lucide-plus" color="primary" label="Create" @click="openCreate" />
      </template>
    </PageHeader>

    <DataState :status="status" :error="error" :empty="!filtered.length" empty-label="No volumes." empty-icon="i-lucide-database">
      <div class="space-y-2">
        <div
          v-for="v in filtered"
          :key="v.name"
          class="panel-flush p-3.5 grid cursor-pointer grid-cols-2 gap-3 transition hover:ring-1 hover:ring-beacon/30 sm:grid-cols-12 sm:items-center"
          tabindex="0"
          role="link"
          :aria-label="`Open volume ${v.name}`"
          @click="openVolume(v)"
          @keydown.enter="openVolume(v)"
        >
          <div class="col-span-2 sm:col-span-5 min-w-0">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-database" class="size-4 text-(--color-muted)" />
              <span class="truncate font-medium text-foam">{{ v.name }}</span>
            </div>
            <p class="mt-1 truncate pl-6 font-mono text-xs text-faint">{{ v.mountpoint }}</p>
          </div>
          <div class="sm:col-span-2 font-mono text-xs text-(--color-muted)">{{ v.driver }}</div>
          <div class="sm:col-span-2 text-xs text-(--color-muted)">{{ v.scope }}</div>
          <div class="sm:col-span-2 text-xs text-faint">{{ relative(v.created) }}</div>
          <div class="col-span-2 sm:col-span-1 flex justify-end">
            <UButton v-if="can('operator')" icon="i-lucide-trash-2" color="error" variant="ghost" size="sm" @click.stop="remove(v)" />
          </div>
        </div>
      </div>
    </DataState>

    <UModal v-model:open="open" title="Create volume">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Name" required><UInput v-model="form.name" class="w-full font-mono" placeholder="app-data" /></UFormField>
          <UFormField label="Driver"><UInput v-model="form.driver" class="w-full font-mono" /></UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" label="Cancel" @click="open = false" />
          <UButton color="primary" label="Create" icon="i-lucide-check" @click="create" />
        </div>
      </template>
    </UModal>

    <ConfirmPasswordModal
      :open="!!removeTarget"
      @update:open="(v: boolean) => { if (!v) removeTarget = null }"
      title="Delete volume"
      :message="removeTarget ? `Volume ${removeTarget.name} and all data stored in it will be permanently deleted.` : ''"
      confirm-label="Delete volume"
      :action="confirmRemove"
    />
  </div>
</template>
