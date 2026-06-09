<script setup lang="ts">
const { relative, short } = useFormat()
const { data, status, error, refresh } = await useFetch('/api/tasks', { lazy: true })

const search = ref('')
const onlyActive = ref(false)
const filtered = computed(() => {
  const q = search.value.toLowerCase()
  return (data.value || []).filter((t: any) => {
    if (onlyActive.value && t.state !== 'running') return false
    return !q || t.service?.toLowerCase().includes(q) || t.node?.toLowerCase().includes(q) || t.image?.toLowerCase().includes(q)
  })
})
</script>

<template>
  <div>
    <PageHeader title="Tasks" subtitle="Individual task instances scheduled across the swarm" icon="i-lucide-list-checks">
      <template #actions>
        <UInput v-model="search" icon="i-lucide-search" placeholder="Filter tasks" class="w-40 sm:w-52" />
        <UButton :color="onlyActive ? 'primary' : 'neutral'" :variant="onlyActive ? 'soft' : 'ghost'" icon="i-lucide-activity" label="Running" @click="onlyActive = !onlyActive" />
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" @click="refresh()" />
      </template>
    </PageHeader>

    <DataState :status="status" :error="error" :empty="!filtered.length" empty-label="No tasks." empty-icon="i-lucide-list-checks">
      <div class="space-y-2">
        <div v-for="t in filtered" :key="t.id" class="panel-flush p-3 grid grid-cols-2 gap-2 sm:grid-cols-12 sm:items-center text-sm">
          <div class="col-span-2 sm:col-span-3 min-w-0">
            <p class="truncate font-medium text-[var(--color-foam)]">{{ t.service }}<span v-if="t.slot != null" class="text-[var(--color-faint)]">.{{ t.slot }}</span></p>
            <p class="truncate font-mono text-xs text-[var(--color-faint)]">{{ t.image }}</p>
          </div>
          <div class="sm:col-span-3 min-w-0 font-mono text-xs text-[var(--color-muted)] truncate">
            <UIcon name="i-lucide-server" class="size-3 inline mr-1" />{{ t.node }}
          </div>
          <div class="sm:col-span-2"><StatusBadge :state="t.state" /></div>
          <div class="sm:col-span-2 text-xs text-[var(--color-faint)]">{{ relative(t.timestamp) }}</div>
          <div class="col-span-2 sm:col-span-2 truncate text-xs" :class="t.state === 'failed' || t.state === 'rejected' ? 'text-rose-300/80' : 'text-[var(--color-faint)]'" :title="t.message">{{ t.message || '—' }}</div>
        </div>
      </div>
    </DataState>
  </div>
</template>
