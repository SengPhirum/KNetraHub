<script setup lang="ts">
const { can } = useAuth()
const { bytes, cpus } = useFormat()
const { prefs } = usePreferences()
const toast = useToast()

const { data, status, error, refreshing, refresh } = useApiCache('nodes', () => $fetch<any[]>('/api/nodes'))
onMounted(refresh)

const { connected } = useDockerEvents((evt) => {
  if (evt.type === 'node') refresh()
})
useIntervalFn(() => {
  if (!connected.value && prefs.value.refreshInterval > 0) refresh()
}, computed(() => prefs.value.refreshInterval > 0 ? prefs.value.refreshInterval * 1000 : 60_000), { immediate: false })

async function patch(node: any, body: any, label: string) {
  // Optimistic update
  const saved = [...(data.value ?? [])]
  const idx = saved.findIndex((n) => n.id === node.id)
  if (idx !== -1) data.value = saved.map((n, i) => i === idx ? { ...n, ...body } : n)
  try {
    await $fetch(`/api/nodes/${node.id}`, { method: 'PATCH', body })
    toast.add({ title: `${node.hostname}: ${label}`, color: 'primary', icon: 'i-lucide-server' })
    refresh()
  } catch (e: any) {
    data.value = saved
    toast.add({ title: 'Action failed', description: e?.data?.statusMessage, color: 'error' })
  }
}

function menu(n: any) {
  const items: any[] = [[{ label: 'Inspect', icon: 'i-lucide-eye', to: `/nodes/${n.id}` }]]
  if (can('operator')) {
    const avail: any[] = []
    if (n.availability !== 'active') avail.push({ label: 'Activate', icon: 'i-lucide-play', onSelect: () => patch(n, { availability: 'active' }, 'activated') })
    if (n.availability !== 'pause') avail.push({ label: 'Pause', icon: 'i-lucide-pause', onSelect: () => patch(n, { availability: 'pause' }, 'paused') })
    if (n.availability !== 'drain') avail.push({ label: 'Drain', icon: 'i-lucide-download', onSelect: () => patch(n, { availability: 'drain' }, 'draining') })
    items.push(avail)
    items.push([
      n.role === 'worker'
        ? { label: 'Promote to manager', icon: 'i-lucide-arrow-up', onSelect: () => patch(n, { role: 'manager' }, 'promoted') }
        : { label: 'Demote to worker', icon: 'i-lucide-arrow-down', onSelect: () => patch(n, { role: 'worker' }, 'demoted') }
    ])
  }
  return items
}
</script>

<template>
  <div>
    <PageHeader title="Nodes" subtitle="Managers and workers in the swarm fleet" icon="i-lucide-server">
      <template #actions>
        <div class="flex items-center gap-1.5 text-xs text-faint select-none">
          <span class="dot" :class="connected ? 'dot-running' : 'dot-idle'" />
          {{ connected ? 'Live' : prefs.refreshInterval > 0 ? `${prefs.refreshInterval}s` : 'Manual' }}
        </div>
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" :loading="refreshing" @click="refresh()" />
      </template>
    </PageHeader>

    <DataState :status="status" :error="error" :empty="!data?.length" :refreshing="refreshing" empty-label="No nodes found." empty-icon="i-lucide-server">
      <div class="space-y-2">
        <TransitionGroup name="list" tag="div" class="space-y-2">
          <div v-for="n in data" :key="n.id" class="panel-flush p-3.5 grid grid-cols-2 gap-3 sm:grid-cols-12 sm:items-center">
            <div class="col-span-2 sm:col-span-4 min-w-0">
              <NuxtLink :to="`/nodes/${n.id}`" class="flex items-center gap-2 group">
                <span v-if="n.leader" class="sonar text-beacon"><UIcon name="i-lucide-anchor" class="size-4" /></span>
                <span v-else class="dot" :class="n.state === 'ready' ? 'dot-running' : 'dot-down'" />
                <span class="truncate font-medium text-foam group-hover:text-beacon">{{ n.hostname || '—' }}</span>
              </NuxtLink>
              <p class="mt-1 truncate pl-6 font-mono text-xs text-faint">{{ n.addr || '—' }} · {{ n.platform || '—' }}</p>
            </div>
            <div class="sm:col-span-2">
              <span class="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium"
                :class="n.role === 'manager' ? 'bg-beacon/10 text-beacon' : 'bg-surface-2 text-(--color-muted)'">
                <UIcon :name="n.role === 'manager' ? 'i-lucide-crown' : 'i-lucide-box'" class="size-3" />
                {{ n.role }}<span v-if="n.leader"> · leader</span>
              </span>
            </div>
            <div class="sm:col-span-2"><StatusBadge :state="n.availability === 'active' ? n.state : n.availability" /></div>
            <div class="sm:col-span-3 font-mono text-xs text-(--color-muted)">{{ cpus(n.cpus) }} · {{ bytes(n.memory ?? 0) }}</div>
            <div class="col-span-2 sm:col-span-1 flex justify-end">
              <UDropdownMenu :items="menu(n)" :content="{ align: 'end' }">
                <UButton icon="i-lucide-ellipsis-vertical" color="neutral" variant="ghost" size="sm" aria-label="Actions" />
              </UDropdownMenu>
            </div>
          </div>
        </TransitionGroup>
      </div>
    </DataState>
  </div>
</template>
