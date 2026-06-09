<script setup lang="ts">
const { bytes, cpus } = useFormat()
const { data, status, error, refresh } = await useFetch('/api/system/overview', { lazy: true })

// poll the bridge every 10s
let timer: any
onMounted(() => { timer = setInterval(refresh, 10000) })
onBeforeUnmount(() => clearInterval(timer))

const taskOrder = ['running', 'pending', 'preparing', 'starting', 'complete', 'shutdown', 'failed', 'rejected']
const taskEntries = computed(() =>
  Object.entries(data.value?.taskStates || {}).sort((a, b) => taskOrder.indexOf(a[0]) - taskOrder.indexOf(b[0]))
)
</script>

<template>
  <div>
    <PageHeader title="Bridge" subtitle="Live overview of the swarm" icon="i-lucide-radar">
      <template #actions>
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" label="Refresh" @click="refresh()" />
      </template>
    </PageHeader>

    <DataState :status="status" :error="error">
      <!-- metrics -->
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Nodes ready" :value="`${data?.nodes.ready}/${data?.nodes.total}`" icon="i-lucide-server"
          :hint="`${data?.nodes.managers} managers · ${data?.nodes.workers} workers`" accent />
        <StatCard label="Services" :value="data?.counts.services ?? 0" icon="i-lucide-boxes"
          :hint="`${data?.counts.stacks} stacks`" />
        <StatCard label="Running tasks" :value="data?.counts.runningTasks ?? 0" icon="i-lucide-list-checks"
          :hint="`${data?.counts.tasks} total`" />
        <StatCard label="Cluster capacity" :value="cpus(data?.capacity.cpus || 0)" icon="i-lucide-cpu"
          :hint="bytes(data?.capacity.memoryBytes)" />
      </div>

      <!-- the fleet: each node as a vessel -->
      <section class="panel mt-6 p-5">
        <div class="flex items-center justify-between mb-4">
          <h2 class="font-display text-sm font-semibold uppercase tracking-wider text-[var(--color-muted)]">The fleet</h2>
          <NuxtLink to="/nodes" class="text-xs text-[var(--color-beacon)] hover:underline">Manage nodes →</NuxtLink>
        </div>
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <NuxtLink
            v-for="node in data?.nodeList"
            :key="node.id"
            :to="`/nodes/${node.id}`"
            class="panel-flush flex items-center gap-3 p-3.5 transition hover:ring-1 hover:ring-[var(--color-beacon)]/30"
          >
            <span
              class="flex size-10 items-center justify-center rounded-lg ring-1"
              :class="node.leader
                ? 'sonar bg-[var(--color-beacon)]/15 ring-[var(--color-beacon)]/40'
                : 'bg-[var(--color-surface-2)] ring-[var(--color-hull)]'"
            >
              <UIcon
                :name="node.role === 'manager' ? 'i-lucide-anchor' : 'i-lucide-box'"
                class="size-5"
                :class="node.leader ? 'text-[var(--color-beacon)]' : 'text-[var(--color-muted)]'"
              />
            </span>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <p class="truncate font-medium text-[var(--color-foam)]">{{ node.hostname }}</p>
                <span v-if="node.leader" class="rounded bg-[var(--color-beacon)]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[var(--color-beacon)]">Leader</span>
              </div>
              <p class="mt-0.5 truncate font-mono text-xs text-[var(--color-faint)]">
                {{ node.role }} · {{ cpus(node.cpus) }} · {{ bytes(node.memory) }}
              </p>
            </div>
            <StatusBadge :state="node.state" />
          </NuxtLink>
        </div>
      </section>

      <!-- task distribution -->
      <section class="panel mt-6 p-5">
        <h2 class="font-display text-sm font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-4">Task distribution</h2>
        <div class="flex flex-wrap gap-2">
          <div v-for="[state, count] in taskEntries" :key="state"
            class="panel-flush flex items-center gap-2.5 px-3 py-2">
            <StatusBadge :state="state" />
            <span class="font-mono text-sm font-semibold text-[var(--color-foam)]">{{ count }}</span>
          </div>
          <p v-if="!taskEntries.length" class="text-sm text-[var(--color-muted)]">No tasks scheduled.</p>
        </div>
        <p class="mt-4 font-mono text-xs text-[var(--color-faint)]">
          Docker {{ data?.swarm.dockerVersion }} · swarm {{ (data?.swarm.id || '').slice(0, 12) }}
        </p>
      </section>
    </DataState>
  </div>
</template>
