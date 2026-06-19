<script setup lang="ts">
const route = useRoute()
const id = route.params.id as string
const { can } = useAuth()
const { relative, short, bytes } = useFormat()
const toast = useToast()

const { data, status, error, refresh } = await useFetch(`/api/services/${id}`, { lazy: true })

const spec = computed(() => data.value?.service?.Spec)
const name = computed(() => spec.value?.Name)
const image = computed(() => (spec.value?.TaskTemplate?.ContainerSpec?.Image || '').split('@')[0])
const mode = computed(() => spec.value?.Mode?.Global ? 'global' : 'replicated')
const replicas = computed(() => spec.value?.Mode?.Replicated?.Replicas ?? null)
const ports = computed(() => data.value?.service?.Endpoint?.Ports || [])
const envs = computed(() => spec.value?.TaskTemplate?.ContainerSpec?.Env || [])
const networks = computed(() => spec.value?.TaskTemplate?.Networks || [])
const stack = computed(() => spec.value?.Labels?.['com.docker.stack.namespace'])
const taskRows = computed(() => data.value?.tasks || [])
const taskSortOptions = [
  { label: 'Slot', value: 'Slot' },
  { label: 'State', value: 'Status.State' },
  { label: 'Node', value: 'NodeID' },
  { label: 'Updated', value: 'Status.Timestamp' },
  { label: 'Message', value: 'Status.Message' }
]
const { items: filteredTasks, search, sortBy, sortDir, sortOptions } = useListControls(`service:${id}:tasks`, taskRows, {
  sortOptions: taskSortOptions,
  defaultSortBy: 'Slot'
})

const tab = ref<'tasks' | 'logs' | 'config' | 'history'>('tasks')

// status history
const statusEvents = ref<any[]>([])
const historyLoading = ref(false)
async function loadHistory() {
  historyLoading.value = true
  try {
    const res: any = await $fetch(`/api/services/${id}/status-events`)
    statusEvents.value = res.events || []
  } finally { historyLoading.value = false }
}
watch(tab, (t) => { if (t === 'history' && !statusEvents.value.length) loadHistory() })

// logs
const logs = ref('')
const logsLoading = ref(false)
const tail = ref(200)
async function loadLogs() {
  logsLoading.value = true
  try {
    const res: any = await $fetch(`/api/services/${id}/logs`, { query: { tail: tail.value } })
    logs.value = res.logs || ''
  } catch (e: any) {
    logs.value = `Failed to load logs: ${e?.data?.statusMessage || e?.message}`
  } finally { logsLoading.value = false }
}
watch(tab, (t) => { if (t === 'logs' && !logs.value) loadLogs() })

// scale
const scaleOpen = ref(false)
const scaleValue = ref(1)
function openScale() { scaleValue.value = replicas.value ?? 1; scaleOpen.value = true }
async function doScale() {
  try {
    await $fetch(`/api/services/${id}/scale`, { method: 'POST', body: { replicas: Number(scaleValue.value) } })
    toast.add({ title: `Scaled → ${scaleValue.value}`, color: 'primary', icon: 'i-lucide-scaling' })
    scaleOpen.value = false
    setTimeout(refresh, 700)
  } catch (e: any) { toast.add({ title: 'Scale failed', description: e?.data?.statusMessage, color: 'error' }) }
}

// update image
const imageOpen = ref(false)
const newImage = ref('')
function openImage() { newImage.value = image.value; imageOpen.value = true }
async function doImage() {
  try {
    await $fetch(`/api/services/${id}/image`, { method: 'POST', body: { image: newImage.value } })
    toast.add({ title: 'Image updated', description: newImage.value, color: 'primary', icon: 'i-lucide-container' })
    imageOpen.value = false
    setTimeout(refresh, 700)
  } catch (e: any) { toast.add({ title: 'Update failed', description: e?.data?.statusMessage, color: 'error' }) }
}

async function redeploy() {
  try {
    await $fetch(`/api/services/${id}/redeploy`, { method: 'POST' })
    toast.add({ title: 'Redeploying', color: 'primary', icon: 'i-lucide-refresh-cw' })
    setTimeout(refresh, 700)
  } catch (e: any) { toast.add({ title: 'Redeploy failed', description: e?.data?.statusMessage, color: 'error' }) }
}

async function remove() {
  if (!confirm(`Remove service "${name.value}"?`)) return
  try {
    await $fetch(`/api/services/${id}`, { method: 'DELETE' })
    toast.add({ title: `Removed ${name.value}`, color: 'primary' })
    navigateTo('/services')
  } catch (e: any) { toast.add({ title: 'Remove failed', description: e?.data?.statusMessage, color: 'error' }) }
}
</script>

<template>
  <div>
    <DataState :status="status" :error="error">
      <PageHeader :title="name || short(id)" :subtitle="mode === 'global' ? 'Global service' : `${replicas} replicas`" icon="i-lucide-box">
        <template #actions>
          <UButton icon="i-lucide-arrow-left" color="neutral" variant="ghost" to="/services" label="Back" />
          <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" @click="refresh()" />
          <template v-if="can('operator')">
            <UButton v-if="mode === 'replicated'" icon="i-lucide-scaling" color="neutral" variant="soft" label="Scale" @click="openScale" />
            <UButton icon="i-lucide-container" color="neutral" variant="soft" label="Image" @click="openImage" />
            <UButton icon="i-lucide-refresh-cw" color="primary" variant="soft" label="Redeploy" @click="redeploy" />
            <UButton icon="i-lucide-trash-2" color="error" variant="soft" @click="remove" />
          </template>
        </template>
      </PageHeader>

      <!-- summary -->
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-5">
        <StatCard label="Image" :value="image" icon="i-lucide-container" />
        <StatCard label="Mode" :value="mode" icon="i-lucide-layers" />
        <NuxtLink v-if="stack" :to="`/stacks/${stack}`">
          <StatCard label="Stack" :value="stack" icon="i-lucide-layers" />
        </NuxtLink>
        <StatCard v-else label="Replicas" :value="replicas ?? '—'" icon="i-lucide-copy" />
        <StatCard label="Service ID" :value="short(id)" icon="i-lucide-hash" />
      </div>

      <div class="flex flex-wrap gap-1 mb-5 border-b border-hull">
        <button v-for="t in [{k:'tasks',l:'Tasks',i:'i-lucide-list'},{k:'logs',l:'Logs',i:'i-lucide-scroll-text'},{k:'config',l:'Config',i:'i-lucide-settings-2'},{k:'history',l:'History',i:'i-lucide-history'}]" :key="t.k"
          @click="tab = t.k as any"
          class="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition"
          :class="tab === t.k ? 'border-beacon text-foam' : 'border-transparent text-(--color-muted) hover:text-foam'">
          <UIcon :name="t.i" class="size-4" /> {{ t.l }}
        </button>
      </div>

      <!-- tasks -->
      <div v-if="tab === 'tasks'" class="space-y-2">
        <ListControls
          v-model:search="search"
          v-model:sort-by="sortBy"
          v-model:sort-dir="sortDir"
          :sort-options="sortOptions"
          placeholder="Search service tasks"
        />
        <div v-if="!filteredTasks.length" class="panel p-10 text-center text-sm text-(--color-muted)">No tasks.</div>
        <div v-for="t in filteredTasks" :key="t.ID" class="panel-flush p-3 grid grid-cols-2 gap-2 sm:grid-cols-12 sm:items-center text-sm">
          <div class="sm:col-span-1 font-mono text-(--color-muted)">#{{ t.Slot ?? '—' }}</div>
          <div class="sm:col-span-3"><StatusBadge :state="t.Status?.State" /></div>
          <div class="sm:col-span-3 font-mono text-xs text-(--color-muted) truncate">{{ short(t.NodeID) }}</div>
          <div class="sm:col-span-3 text-xs text-faint">{{ relative(t.Status?.Timestamp) }}</div>
          <div class="col-span-2 sm:col-span-2 truncate text-xs text-faint" :title="t.Status?.Err || t.Status?.Message">{{ t.Status?.Err || t.Status?.Message || '—' }}</div>
        </div>
      </div>

      <!-- logs -->
      <div v-else-if="tab === 'logs'" class="panel p-0 overflow-hidden">
        <div class="flex items-center justify-between gap-2 border-b border-hull px-4 py-2.5">
          <span class="flex items-center gap-2 text-xs text-(--color-muted)"><UIcon name="i-lucide-scroll-text" class="size-4" /> Last {{ tail }} lines</span>
          <div class="flex gap-2">
            <USelect v-model="tail" :items="[100, 200, 500, 1000]" size="xs" @update:model-value="loadLogs" />
            <UButton size="xs" color="neutral" variant="soft" icon="i-lucide-refresh-cw" :loading="logsLoading" @click="loadLogs" />
          </div>
        </div>
        <div v-if="logsLoading && !logs" class="flex items-center justify-center py-16 text-(--color-muted)">
          <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin mr-2" /> Streaming…
        </div>
        <pre v-else class="logstream max-h-[60vh] overflow-auto px-4 py-3 text-xs whitespace-pre-wrap">{{ logs || 'No log output.' }}</pre>
      </div>

      <!-- config -->
      <div v-else-if="tab === 'config'" class="space-y-4">
        <div v-if="ports.length" class="panel p-4">
          <h3 class="font-display text-sm font-semibold text-foam mb-3">Published ports</h3>
          <div class="flex flex-wrap gap-2">
            <span v-for="(p, i) in ports" :key="i" class="font-mono text-xs rounded bg-surface-2 px-2 py-1 text-(--color-muted)">
              {{ p.PublishedPort }}:{{ p.TargetPort }}/{{ p.Protocol }}
            </span>
          </div>
        </div>
        <div v-if="networks.length" class="panel p-4">
          <h3 class="font-display text-sm font-semibold text-foam mb-3">Networks</h3>
          <div class="flex flex-wrap gap-2">
            <span v-for="(n, i) in networks" :key="i" class="font-mono text-xs rounded bg-surface-2 px-2 py-1 text-(--color-muted)">{{ n.Target }}</span>
          </div>
        </div>
        <div v-if="envs.length" class="panel p-4">
          <h3 class="font-display text-sm font-semibold text-foam mb-3">Environment</h3>
          <div class="space-y-1 font-mono text-xs">
            <p v-for="(e, i) in envs" :key="i" class="text-(--color-muted) break-all">
              <span class="text-beacon">{{ e.split('=')[0] }}</span>=<span class="text-faint">{{ e.split('=').slice(1).join('=') }}</span>
            </p>
          </div>
        </div>
      </div>

      <!-- history -->
      <div v-else-if="tab === 'history'" class="space-y-2">
        <div v-if="historyLoading && !statusEvents.length" class="flex items-center justify-center py-16 text-(--color-muted)">
          <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin mr-2" /> Loading…
        </div>
        <div v-else-if="!statusEvents.length" class="panel p-10 text-center text-sm text-(--color-muted)">No status history yet.</div>
        <div v-else v-for="(e, i) in statusEvents" :key="i" class="panel-flush p-3 flex items-center justify-between gap-3 text-sm">
          <div class="flex items-center gap-3 min-w-0">
            <StatusBadge :state="e.status" />
            <span v-if="e.taskId" class="font-mono text-xs text-faint truncate">task {{ short(e.taskId) }}</span>
            <span v-if="e.message" class="text-xs text-faint truncate">{{ e.message }}</span>
          </div>
          <span class="text-xs text-faint shrink-0">{{ relative(e.time) }}</span>
        </div>
      </div>
    </DataState>

    <!-- scale modal -->
    <UModal v-model:open="scaleOpen" title="Scale service">
      <template #body>
        <p class="text-sm text-(--color-muted) mb-4">Replica count for <span class="font-mono text-foam">{{ name }}</span>.</p>
        <UInput v-model="scaleValue" type="number" min="0" size="lg" class="w-full" icon="i-lucide-scaling" />
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" label="Cancel" @click="scaleOpen = false" />
          <UButton color="primary" label="Apply" icon="i-lucide-check" @click="doScale" />
        </div>
      </template>
    </UModal>

    <!-- image modal -->
    <UModal v-model:open="imageOpen" title="Update image">
      <template #body>
        <p class="text-sm text-(--color-muted) mb-4">Set a new image. The service performs a rolling update.</p>
        <UInput v-model="newImage" size="lg" class="w-full font-mono" icon="i-lucide-container" placeholder="nginx:1.27" />
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" label="Cancel" @click="imageOpen = false" />
          <UButton color="primary" label="Update" icon="i-lucide-check" @click="doImage" />
        </div>
      </template>
    </UModal>
  </div>
</template>
