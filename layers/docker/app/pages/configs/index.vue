<script setup lang="ts">
const { can } = useAuth()
const { relative, short } = useFormat()
const toast = useToast()
const { data, status, error, refresh } = await useFetch('/api/configs', { lazy: true })
const configSortOptions = [
  { label: 'Name', value: 'name' },
  { label: 'Stack', value: 'stack' },
  { label: 'Created', value: 'created' },
  { label: 'Updated', value: 'updated' }
]
const configFilterOptions = [
  { key: 'stack', label: 'Stack', getValue: (c: any) => c.stack || 'standalone' }
]
const { items: filtered, search, sortBy, sortDir, sortOptions, filters, facets } = useListControls('configs', data, {
  sortOptions: configSortOptions,
  defaultSortBy: 'name',
  filterOptions: configFilterOptions
})

const open = ref(false)
const form = reactive({ name: '', data: '' })
function openCreate() { Object.assign(form, { name: '', data: '' }); open.value = true }
async function create() {
  if (!form.name || !form.data) { toast.add({ title: 'Name and content required', color: 'warning' }); return }
  try {
    await $fetch('/api/configs', { method: 'POST', body: { name: form.name, data: btoa(form.data) } })
    toast.add({ title: `Created ${form.name}`, color: 'primary', icon: 'i-lucide-file-cog' })
    open.value = false
    setTimeout(refresh, 500)
  } catch (e: any) { toast.add({ title: 'Create failed', description: e?.data?.statusMessage, color: 'error' }) }
}

async function remove(c: any) {
  if (!confirm(`Delete config "${c.name}"?`)) return
  try {
    await $fetch(`/api/configs/${c.id}`, { method: 'DELETE' })
    toast.add({ title: `Deleted ${c.name}`, color: 'primary' })
    refresh()
  } catch (e: any) { toast.add({ title: 'Delete failed', description: deleteErrorDescription(e), color: 'error', ui: { description: 'whitespace-pre-line' } }) }
}

function openConfig(c: any) {
  navigateTo(`/configs/${c.id}`)
}
</script>

<template>
  <div>
    <PageHeader title="Configs" subtitle="Non-sensitive configuration delivered to services" icon="i-lucide-file-cog">
      <template #actions>
        <ListControls
          inline
          v-model:search="search"
          v-model:sort-by="sortBy"
          v-model:sort-dir="sortDir"
          v-model:filters="filters"
          :sort-options="sortOptions"
          :facets="facets"
          placeholder="Search configs"
        />
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" @click="refresh()" />
        <UButton v-if="can('operator')" icon="i-lucide-plus" color="primary" label="Create" @click="openCreate" />
      </template>
    </PageHeader>

    <DataState :status="status" :error="error" :empty="!filtered.length" empty-label="No configs." empty-icon="i-lucide-file-cog">
      <div class="space-y-2">
        <div
          v-for="c in filtered"
          :key="c.id"
          class="panel-flush p-3.5 grid cursor-pointer grid-cols-2 gap-3 transition hover:ring-1 hover:ring-beacon/30 sm:grid-cols-12 sm:items-center"
          tabindex="0"
          role="link"
          :aria-label="`Open config ${c.name}`"
          @click="openConfig(c)"
          @keydown.enter="openConfig(c)"
        >
          <div class="col-span-2 sm:col-span-6 min-w-0">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-file-cog" class="size-4 text-(--color-muted)" />
              <span class="truncate font-medium text-foam">{{ c.name }}</span>
              <span v-if="c.stack" class="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-faint">{{ c.stack }}</span>
            </div>
            <p class="mt-1 truncate pl-6 font-mono text-xs text-faint">{{ short(c.id) }}</p>
          </div>
          <div class="sm:col-span-4 text-xs text-faint">Created {{ relative(c.created) }}</div>
          <div class="col-span-2 sm:col-span-2 flex justify-end gap-1">
            <UButton icon="i-lucide-eye" color="neutral" variant="ghost" size="sm" :to="`/configs/${c.id}`" @click.stop />
            <UButton v-if="can('operator')" icon="i-lucide-trash-2" color="error" variant="ghost" size="sm" @click.stop="remove(c)" />
          </div>
        </div>
      </div>
    </DataState>

    <UModal v-model:open="open" title="Create config" :dismissible="false">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Name" required><UInput v-model="form.name" class="w-full font-mono" placeholder="nginx.conf" /></UFormField>
          <UFormField label="Content" required><UTextarea v-model="form.data" :rows="10" class="w-full font-mono text-xs" spellcheck="false" /></UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" label="Cancel" @click="open = false" />
          <UButton color="primary" label="Create" icon="i-lucide-check" @click="create" />
        </div>
      </template>
    </UModal>
  </div>
</template>
