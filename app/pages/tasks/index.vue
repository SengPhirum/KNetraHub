<script setup lang="ts">
const { relative } = useFormat()
const { prefs } = usePreferences()

const { data, status, error, refreshing, refresh } = useApiCache('tasks', () => $fetch<any[]>('/api/tasks'))
onMounted(refresh)

const { connected } = useDockerEvents((evt) => {
  if (['task', 'service', 'container'].includes(evt.type)) refresh()
})
useIntervalFn(() => {
  if (!connected.value && prefs.value.refreshInterval > 0) refresh()
}, computed(() => prefs.value.refreshInterval > 0 ? prefs.value.refreshInterval * 1000 : 60_000), { immediate: false })

const search = ref('')
const onlyActive = ref(false)
const filtered = computed(() => {
  const q = search.value.toLowerCase()
  return (data.value ?? []).filter((t: any) => {
    if (onlyActive.value && t.state !== 'running') return false
    return !q || t.service?.toLowerCase().includes(q) || t.node?.toLowerCase().includes(q) || t.image?.toLowerCase().includes(q)
  })
})
</script>

<template>
  <div>
    <PageHeader title="Tasks" subtitle="Individual task instances scheduled across the swarm" icon="i-lucide-list-checks">
      <template #actions>
        <div class="flex items-center gap-1.5 text-xs text-faint select-none">
          <span class="dot" :class="connected ? 'dot-running' : 'dot-idle'" />
          {{ connected ? 'Live' : prefs.refreshInterval > 0 ? `${prefs.refreshInterval}s` : 'Manual' }}
        </div>
        <UInput v-model="search" icon="i-lucide-search" placeholder="Filter tasks" class="w-40 sm:w-52" />
        <UButton :color="onlyActive ? 'primary' : 'neutral'" :variant="onlyActive ? 'soft' : 'ghost'" icon="i-lucide-activity" label="Running" @click="onlyActive = !onlyActive" />
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" :loading="refreshing" @click="refresh()" />
      </template>
    </PageHeader>

    <DataState :status="status" :error="error" :empty="!filtered.length" :refreshing="refreshing" empty-label="No tasks." empty-icon="i-lucide-list-checks">
      <div class="space-y-2">
        <div v-for="t in filtered" :key="t.id" class="panel-flush p-3 grid grid-cols-2 gap-2 sm:grid-cols-12 sm:items-center text-sm">
          <div class="col-span-2 sm:col-span-3 min-w-0">
            <p class="truncate font-medium text-foam">
              {{ t.service || '—' }}<span v-if="t.slot != null" class="text-faint">.{{ t.slot }}</span>
            </p>
            <p class="truncate font-mono text-xs text-faint">{{ t.image || '—' }}</p>
          </div>
          <div class="sm:col-span-3 min-w-0 font-mono text-xs text-(--color-muted) truncate">
            <UIcon name="i-lucide-server" class="size-3 inline mr-1" />{{ t.node || '—' }}
          </div>
          <div class="sm:col-span-2"><StatusBadge :state="t.state" /></div>
          <div class="sm:col-span-2 text-xs text-faint">{{ relative(t.timestamp) }}</div>
          <div class="col-span-2 sm:col-span-2 truncate text-xs" :class="t.state === 'failed' || t.state === 'rejected' ? 'status-down opacity-80' : 'text-faint'" :title="t.message">
            {{ t.message || '—' }}
          </div>
        </div>
      </div>
    </DataState>
  </div>
</template>
