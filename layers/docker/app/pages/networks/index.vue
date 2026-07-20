<script setup lang="ts">
const { can } = useAuth()
const { short } = useFormat()
const { prefs } = usePreferences()
const toast = useToast()

const { data, status, error, refreshing, refresh } = useApiCache('networks', () => $fetch<any[]>('/api/networks'))
onMounted(refresh)

const { connected } = useDockerEvents((evt) => {
  if (evt.type === 'resource-list' && evt.resource === 'networks') data.value = evt.data
})
useIntervalFn(() => {
  if (!connected.value && prefs.value.refreshInterval > 0) refresh()
}, computed(() => prefs.value.refreshInterval > 0 ? prefs.value.refreshInterval * 1000 : 60_000), { immediate: false })

const networkSortOptions = [
  { label: 'Name', value: 'name' },
  { label: 'Driver', value: 'driver' },
  { label: 'Scope', value: 'scope' },
  { label: 'Stack', value: 'stack' },
  { label: 'Subnet', value: 'subnet' },
  { label: 'Created', value: 'created' }
]
const networkFilterOptions = [
  { key: 'driver', label: 'Driver', getValue: (n: any) => n.driver },
  { key: 'scope', label: 'Scope', getValue: (n: any) => n.scope }
]
const { items: filtered, search, sortBy, sortDir, sortOptions, filters, facets } = useListControls('networks', data, {
  sortOptions: networkSortOptions,
  defaultSortBy: 'name',
  filterOptions: networkFilterOptions
})

const open = ref(false)
const form = reactive({ name: '', driver: 'overlay', subnet: '', attachable: true, internal: false })
function openCreate() { Object.assign(form, { name: '', driver: 'overlay', subnet: '', attachable: true, internal: false }); open.value = true }

async function create() {
  if (!form.name) { toast.add({ title: 'Name required', color: 'warning' }); return }
  try {
    const newNet = await $fetch<any>('/api/networks', { method: 'POST', body: { ...form } })
    data.value = [...(data.value ?? []), newNet]
    toast.add({ title: `Created ${form.name}`, color: 'primary', icon: 'i-lucide-network' })
    open.value = false
  } catch (e: any) {
    toast.add({ title: 'Create failed', description: e?.data?.statusMessage, color: 'error' })
    refresh()
  }
}

const deleteTarget = ref<any>(null)
async function confirmRemove(headers: Record<string, string>) {
  const n = deleteTarget.value
  if (!n) return
  await $fetch(`/api/networks/${n.id}`, { method: 'DELETE', headers })
  data.value = (data.value ?? []).filter((x) => x.id !== n.id)
  toast.add({ title: `Deleted ${n.name}`, color: 'primary' })
  deleteTarget.value = null
}

function openNetwork(n: any) {
  navigateTo(`/networks/${n.id}`)
}

const SYSTEM = ['bridge', 'host', 'none', 'docker_gwbridge', 'ingress']
</script>

<template>
  <div>
    <PageHeader title="Networks" subtitle="Overlay and bridge networks" icon="i-lucide-network">
      <template #actions>
        <ListControls
          inline
          v-model:search="search"
          v-model:sort-by="sortBy"
          v-model:sort-dir="sortDir"
          v-model:filters="filters"
          :sort-options="sortOptions"
          :facets="facets"
          placeholder="Search networks"
        />
        <div class="flex items-center gap-1.5 text-xs text-faint select-none">
          <span class="dot" :class="connected ? 'dot-running' : 'dot-idle'" />
          {{ connected ? 'Live' : prefs.refreshInterval > 0 ? `${prefs.refreshInterval}s` : 'Manual' }}
        </div>
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" :loading="refreshing" @click="refresh()" />
        <UButton v-if="can('operator')" icon="i-lucide-plus" color="primary" label="Create" @click="openCreate" />
      </template>
    </PageHeader>

    <DataState :status="status" :error="error" :empty="!filtered.length" :refreshing="refreshing" empty-label="No networks." empty-icon="i-lucide-network">
      <TransitionGroup name="list" tag="div" class="space-y-2">
        <div
          v-for="n in filtered"
          :key="n.id"
          class="panel-flush p-3.5 grid cursor-pointer grid-cols-2 gap-3 transition hover:ring-1 hover:ring-beacon/30 sm:grid-cols-12 sm:items-center"
          tabindex="0"
          role="link"
          :aria-label="`Open network ${n.name}`"
          @click="openNetwork(n)"
          @keydown.enter="openNetwork(n)"
        >
          <div class="col-span-2 sm:col-span-4 min-w-0">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-network" class="size-4 text-(--color-muted)" />
              <span class="truncate font-medium text-foam">{{ n.name || '—' }}</span>
              <span v-if="n.stack" class="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-faint">{{ n.stack }}</span>
            </div>
            <p class="mt-1 truncate pl-6 font-mono text-xs text-faint">{{ short(n.id) || '—' }}</p>
          </div>
          <div class="sm:col-span-2 font-mono text-xs text-(--color-muted)">{{ n.driver || '—' }}</div>
          <div class="sm:col-span-2 text-xs text-(--color-muted)">{{ n.scope || '—' }}</div>
          <div class="sm:col-span-3 font-mono text-xs text-faint">{{ n.subnet || '—' }}</div>
          <div class="col-span-2 sm:col-span-1 flex justify-end">
            <UButton v-if="can('operator') && !SYSTEM.includes(n.name)" icon="i-lucide-trash-2" color="error" variant="ghost" size="sm" @click.stop="deleteTarget = n" />
          </div>
        </div>
      </TransitionGroup>
    </DataState>

    <UModal v-model:open="open" title="Create network">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Name" required><UInput v-model="form.name" class="w-full font-mono" placeholder="app-net" /></UFormField>
          <UFormField label="Driver"><USelect v-model="form.driver" :items="['overlay', 'bridge', 'macvlan']" class="w-full" /></UFormField>
          <UFormField label="Subnet" hint="optional, e.g. 10.0.9.0/24"><UInput v-model="form.subnet" class="w-full font-mono" placeholder="10.0.9.0/24" /></UFormField>
          <div class="flex gap-6">
            <UCheckbox v-model="form.attachable" label="Attachable" />
            <UCheckbox v-model="form.internal" label="Internal" />
          </div>
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
      type="docker.network"
      :item-name="deleteTarget?.name"
      :open="!!deleteTarget"
      @update:open="(v: boolean) => { if (!v) deleteTarget = null }"
      title="Delete network"
      :message="deleteTarget ? `Network ${deleteTarget.name} will be permanently removed.` : ''"
      :action="confirmRemove"
    />
  </div>
</template>
