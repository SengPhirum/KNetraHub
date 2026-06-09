<script setup lang="ts">
const route = useRoute()
const id = route.params.id as string
const { can } = useAuth()
const { bytes, cpus, relative, short } = useFormat()
const toast = useToast()

const { data, status, error, refresh } = await useFetch(`/api/nodes/${id}`, { lazy: true })

const node = computed(() => data.value?.node)
const desc = computed(() => node.value?.Description)
const hostname = computed(() => desc.value?.Hostname)
const labels = computed<Record<string, string>>(() => node.value?.Spec?.Labels || {})

// label editor
const labelsOpen = ref(false)
const labelRows = ref<{ k: string; v: string }[]>([])
function openLabels() {
  labelRows.value = Object.entries(labels.value).map(([k, v]) => ({ k, v: String(v) }))
  if (!labelRows.value.length) labelRows.value.push({ k: '', v: '' })
  labelsOpen.value = true
}
async function saveLabels() {
  const obj: Record<string, string> = {}
  for (const r of labelRows.value) if (r.k.trim()) obj[r.k.trim()] = r.v
  try {
    await $fetch(`/api/nodes/${id}`, { method: 'PATCH', body: { labels: obj } })
    toast.add({ title: 'Labels updated', color: 'primary', icon: 'i-lucide-tags' })
    labelsOpen.value = false
    setTimeout(refresh, 600)
  } catch (e: any) { toast.add({ title: 'Update failed', description: e?.data?.statusMessage, color: 'error' }) }
}

async function remove() {
  if (!confirm(`Remove node "${hostname.value}" from the swarm? It must be down or drained first.`)) return
  try {
    await $fetch(`/api/nodes/${id}?force=true`, { method: 'DELETE' })
    toast.add({ title: `Removed ${hostname.value}`, color: 'primary' })
    navigateTo('/nodes')
  } catch (e: any) { toast.add({ title: 'Remove failed', description: e?.data?.statusMessage, color: 'error' }) }
}
</script>

<template>
  <div>
    <DataState :status="status" :error="error">
      <PageHeader :title="hostname || short(id)" :subtitle="node?.Spec?.Role" icon="i-lucide-server">
        <template #actions>
          <UButton icon="i-lucide-arrow-left" color="neutral" variant="ghost" to="/nodes" label="Back" />
          <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" @click="refresh()" />
          <template v-if="can('operator')">
            <UButton icon="i-lucide-tags" color="neutral" variant="soft" label="Labels" @click="openLabels" />
          </template>
          <UButton v-if="can('admin')" icon="i-lucide-trash-2" color="error" variant="soft" label="Remove" @click="remove" />
        </template>
      </PageHeader>

      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-5">
        <StatCard label="Status" :value="node?.Status?.State || '—'" icon="i-lucide-activity" />
        <StatCard label="Availability" :value="node?.Spec?.Availability || '—'" icon="i-lucide-toggle-right" />
        <StatCard label="CPUs" :value="cpus((desc?.Resources?.NanoCPUs || 0) / 1e9)" icon="i-lucide-cpu" />
        <StatCard label="Memory" :value="bytes(desc?.Resources?.MemoryBytes)" icon="i-lucide-memory-stick" />
      </div>

      <div class="grid gap-4 lg:grid-cols-2 mb-5">
        <div class="panel p-4">
          <h3 class="font-display text-sm font-semibold text-[var(--color-foam)] mb-3">Engine</h3>
          <dl class="space-y-2 text-sm">
            <div class="flex justify-between gap-3"><dt class="text-[var(--color-faint)]">Address</dt><dd class="font-mono text-[var(--color-muted)]">{{ node?.Status?.Addr || '—' }}</dd></div>
            <div class="flex justify-between gap-3"><dt class="text-[var(--color-faint)]">Engine</dt><dd class="font-mono text-[var(--color-muted)]">{{ desc?.Engine?.EngineVersion || '—' }}</dd></div>
            <div class="flex justify-between gap-3"><dt class="text-[var(--color-faint)]">Platform</dt><dd class="font-mono text-[var(--color-muted)]">{{ desc?.Platform?.OS }}/{{ desc?.Platform?.Architecture }}</dd></div>
            <div v-if="node?.ManagerStatus" class="flex justify-between gap-3"><dt class="text-[var(--color-faint)]">Reachability</dt><dd class="font-mono text-[var(--color-muted)]">{{ node.ManagerStatus.Reachability }}</dd></div>
          </dl>
        </div>
        <div class="panel p-4">
          <h3 class="font-display text-sm font-semibold text-[var(--color-foam)] mb-3">Labels</h3>
          <div v-if="Object.keys(labels).length" class="flex flex-wrap gap-2">
            <span v-for="(v, k) in labels" :key="k" class="font-mono text-xs rounded bg-[var(--color-surface-2)] px-2 py-1 text-[var(--color-muted)]">{{ k }}=<span class="text-[var(--color-foam)]">{{ v }}</span></span>
          </div>
          <p v-else class="text-sm text-[var(--color-faint)]">No labels set.</p>
        </div>
      </div>

      <h3 class="font-display text-sm font-semibold text-[var(--color-foam)] mb-3">Tasks on this node</h3>
      <div v-if="!data?.tasks?.length" class="panel p-8 text-center text-sm text-[var(--color-muted)]">No tasks scheduled here.</div>
      <div v-else class="space-y-2">
        <div v-for="t in data.tasks" :key="t.ID" class="panel-flush p-3 flex items-center justify-between gap-3 text-sm">
          <div class="min-w-0">
            <p class="truncate font-mono text-xs text-[var(--color-muted)]">{{ (t.Spec?.ContainerSpec?.Image || '').split('@')[0] }}</p>
          </div>
          <div class="flex items-center gap-4 shrink-0">
            <StatusBadge :state="t.Status?.State" />
            <span class="text-xs text-[var(--color-faint)]">{{ relative(t.Status?.Timestamp) }}</span>
          </div>
        </div>
      </div>
    </DataState>

    <!-- labels modal -->
    <UModal v-model:open="labelsOpen" title="Edit node labels">
      <template #body>
        <div class="space-y-2">
          <div v-for="(r, i) in labelRows" :key="i" class="flex gap-2">
            <UInput v-model="r.k" placeholder="key" class="flex-1 font-mono" />
            <UInput v-model="r.v" placeholder="value" class="flex-1 font-mono" />
            <UButton icon="i-lucide-x" color="neutral" variant="ghost" @click="labelRows.splice(i, 1)" />
          </div>
          <UButton size="xs" color="neutral" variant="soft" icon="i-lucide-plus" label="Add label" @click="labelRows.push({ k: '', v: '' })" />
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" label="Cancel" @click="labelsOpen = false" />
          <UButton color="primary" label="Save" icon="i-lucide-check" @click="saveLabels" />
        </div>
      </template>
    </UModal>
  </div>
</template>
