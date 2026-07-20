<script setup lang="ts">
const { can } = useAuth()
const { relative, short } = useFormat()
const toast = useToast()
const { data, status, error, refresh } = await useFetch('/api/secrets', { lazy: true })
const secretSortOptions = [
  { label: 'Name', value: 'name' },
  { label: 'Stack', value: 'stack' },
  { label: 'Created', value: 'created' },
  { label: 'Updated', value: 'updated' }
]
const secretFilterOptions = [
  { key: 'stack', label: 'Stack', getValue: (s: any) => s.stack || 'standalone' }
]
const { items: filtered, search, sortBy, sortDir, sortOptions, filters, facets } = useListControls('secrets', data, {
  sortOptions: secretSortOptions,
  defaultSortBy: 'name',
  filterOptions: secretFilterOptions
})

const open = ref(false)
const form = reactive({ name: '', data: '' })
function openCreate() { Object.assign(form, { name: '', data: '' }); open.value = true }
async function create() {
  if (!form.name || !form.data) { toast.add({ title: 'Name and value required', color: 'warning' }); return }
  try {
    await $fetch('/api/secrets', { method: 'POST', body: { name: form.name, data: btoa(form.data) } })
    toast.add({ title: `Created ${form.name}`, color: 'primary', icon: 'i-lucide-key-round' })
    open.value = false
    setTimeout(refresh, 500)
  } catch (e: any) { toast.add({ title: 'Create failed', description: e?.data?.statusMessage, color: 'error' }) }
}
const deleteTarget = ref<any>(null)
async function confirmRemove(headers: Record<string, string>) {
  const s = deleteTarget.value
  if (!s) return
  await $fetch(`/api/secrets/${s.id}`, { method: 'DELETE', headers })
  toast.add({ title: `Deleted ${s.name}`, color: 'primary' })
  deleteTarget.value = null
  refresh()
}

function openSecret(s: any) {
  navigateTo(`/secrets/${s.id}`)
}
</script>

<template>
  <div>
    <PageHeader title="Secrets" subtitle="Encrypted secrets distributed to services" icon="i-lucide-key-round">
      <template #actions>
        <ListControls
          inline
          v-model:search="search"
          v-model:sort-by="sortBy"
          v-model:sort-dir="sortDir"
          v-model:filters="filters"
          :sort-options="sortOptions"
          :facets="facets"
          placeholder="Search secrets"
        />
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" @click="refresh()" />
        <UButton v-if="can('operator')" icon="i-lucide-plus" color="primary" label="Create" @click="openCreate" />
      </template>
    </PageHeader>

    <div class="panel p-3 mb-4 border-hull flex items-center gap-2 text-xs text-(--color-muted)">
      <UIcon name="i-lucide-shield" class="size-4 shrink-0 text-beacon" />
      Secret values are write-only — Docker never exposes them after creation.
    </div>

    <DataState :status="status" :error="error" :empty="!filtered.length" empty-label="No secrets." empty-icon="i-lucide-key-round">
      <div class="space-y-2">
        <div
          v-for="s in filtered"
          :key="s.id"
          class="panel-flush p-3.5 grid cursor-pointer grid-cols-2 gap-3 transition hover:ring-1 hover:ring-beacon/30 sm:grid-cols-12 sm:items-center"
          tabindex="0"
          role="link"
          :aria-label="`Open secret ${s.name}`"
          @click="openSecret(s)"
          @keydown.enter="openSecret(s)"
        >
          <div class="col-span-2 sm:col-span-6 min-w-0">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-key-round" class="size-4 text-(--color-muted)" />
              <span class="truncate font-medium text-foam">{{ s.name }}</span>
              <span v-if="s.stack" class="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-faint">{{ s.stack }}</span>
            </div>
            <p class="mt-1 truncate pl-6 font-mono text-xs text-faint">{{ short(s.id) }}</p>
          </div>
          <div class="sm:col-span-5 text-xs text-faint">Created {{ relative(s.created) }}</div>
          <div class="col-span-2 sm:col-span-1 flex justify-end">
            <UButton v-if="can('operator')" icon="i-lucide-trash-2" color="error" variant="ghost" size="sm" @click.stop="deleteTarget = s" />
          </div>
        </div>
      </div>
    </DataState>

    <UModal v-model:open="open" title="Create secret" :dismissible="false">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Name" required><UInput v-model="form.name" class="w-full font-mono" placeholder="db_password" /></UFormField>
          <UFormField label="Value" required hint="Stored encrypted; cannot be read back"><UTextarea v-model="form.data" :rows="5" class="w-full font-mono text-xs" spellcheck="false" /></UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" label="Cancel" @click="open = false" />
          <UButton color="primary" label="Create" icon="i-lucide-check" @click="create" />
        </div>
      </template>
    </UModal>

    <ConfirmDeleteModal
      type="docker.secret"
      :item-name="deleteTarget?.name"
      :open="!!deleteTarget"
      @update:open="(v: boolean) => { if (!v) deleteTarget = null }"
      title="Delete secret"
      :message="deleteTarget ? `Secret ${deleteTarget.name} will be permanently removed. Services using it must be updated first.` : ''"
      :action="confirmRemove"
    />
  </div>
</template>
