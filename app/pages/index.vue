<script setup lang="ts">
const { bytes, cpus } = useFormat()
const { prefs } = usePreferences()

const { data, status, error, refreshing, refresh } = useApiCache('overview', () => $fetch('/api/system/overview'))
onMounted(refresh)

const { connected } = useDockerEvents((evt) => {
  if (['service', 'task', 'node', 'container'].includes(evt.type)) refresh()
})

useIntervalFn(() => {
  if (!connected.value && prefs.value.refreshInterval > 0) refresh()
}, computed(() => prefs.value.refreshInterval > 0 ? prefs.value.refreshInterval * 1000 : 60_000), { immediate: false })

const d = computed(() => data.value as any)

const taskOrder = ['running', 'pending', 'preparing', 'starting', 'complete', 'shutdown', 'failed', 'rejected']
const taskEntries = computed(() =>
  Object.entries(d.value?.taskStates || {}).sort((a, b) => taskOrder.indexOf(a[0]) - taskOrder.indexOf(b[0]))
)
</script>

<template>
  <div>
    <PageHeader title="Bridge" subtitle="Live overview of the swarm" icon="i-lucide-radar">
      <template #actions>
        <div class="flex items-center gap-1.5 text-xs text-faint select-none">
          <span class="dot" :class="connected ? 'dot-running' : 'dot-idle'" />
          {{ connected ? 'Live' : prefs.refreshInterval > 0 ? `${prefs.refreshInterval}s` : 'Manual' }}
        </div>
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" label="Refresh" :loading="refreshing" @click="refresh()" />
      </template>
    </PageHeader>

    <DataState :status="status" :error="error" :refreshing="refreshing">
      <!-- metrics -->
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Nodes ready"
          :value="`${d?.nodes?.ready ?? 0}/${d?.nodes?.total ?? 0}`"
          icon="i-lucide-server"
          :hint="`${d?.nodes?.managers ?? 0} managers · ${d?.nodes?.workers ?? 0} workers`"
          accent
        />
        <StatCard
          label="Services"
          :value="d?.counts?.services ?? 0"
          icon="i-lucide-boxes"
          :hint="`${d?.counts?.stacks ?? 0} stacks`"
        />
        <StatCard
          label="Running tasks"
          :value="d?.counts?.runningTasks ?? 0"
          icon="i-lucide-list-checks"
          :hint="`${d?.counts?.tasks ?? 0} total`"
        />
        <StatCard
          label="Cluster capacity"
          :value="cpus(d?.capacity?.cpus)"
          icon="i-lucide-cpu"
          :hint="bytes(d?.capacity?.memoryBytes)"
        />
      </div>

      <!-- fleet: each node as a vessel -->
      <section class="panel mt-6 p-5">
        <div class="flex items-center justify-between mb-4">
          <h2 class="font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted)">The fleet</h2>
          <NuxtLink to="/nodes" class="text-xs text-beacon hover:underline">Manage nodes →</NuxtLink>
        </div>
        <div v-if="!d?.nodeList?.length" class="text-sm text-(--color-muted) py-2">No nodes visible.</div>
        <div v-else class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <NuxtLink
            v-for="node in d?.nodeList"
            :key="node.id"
            :to="`/nodes/${node.id}`"
            class="panel-flush flex items-center gap-3 p-3.5 transition hover:ring-1 hover:ring-beacon/30"
          >
            <span
              class="flex size-10 items-center justify-center rounded-lg ring-1"
              :class="node.leader ? 'sonar bg-beacon/15 ring-beacon/40' : 'bg-surface-2 ring-hull'"
            >
              <UIcon
                :name="node.role === 'manager' ? 'i-lucide-anchor' : 'i-lucide-box'"
                class="size-5"
                :class="node.leader ? 'text-beacon' : 'text-(--color-muted)'"
              />
            </span>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <p class="truncate font-medium text-foam">{{ node.hostname || '—' }}</p>
                <span v-if="node.leader" class="rounded bg-beacon/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-beacon">Leader</span>
              </div>
              <p class="mt-0.5 truncate font-mono text-xs text-faint">
                {{ node.role || '—' }} · {{ cpus(node.cpus) }} · {{ bytes(node.memory) }}
              </p>
            </div>
            <StatusBadge :state="node.state" />
          </NuxtLink>
        </div>
      </section>

      <!-- task distribution -->
      <section class="panel mt-6 p-5">
        <h2 class="font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted) mb-4">Task distribution</h2>
        <div class="flex flex-wrap gap-2">
          <div v-for="[state, count] in taskEntries" :key="state"
            class="panel-flush flex items-center gap-2.5 px-3 py-2">
            <StatusBadge :state="state" />
            <span class="font-mono text-sm font-semibold text-foam">{{ count }}</span>
          </div>
          <p v-if="!taskEntries.length" class="text-sm text-(--color-muted)">No tasks scheduled.</p>
        </div>
        <p class="mt-4 font-mono text-xs text-faint">
          Docker {{ d?.swarm?.dockerVersion || '—' }} · swarm {{ (d?.swarm?.id || '').slice(0, 12) || '—' }}
        </p>
      </section>
    </DataState>
  </div>
</template>
