<script setup lang="ts">
// Workspace activity trail (manager+): every hierarchy and task mutation.
const filters = reactive({ actor: '', entity_type: '' })
const query = computed(() => ({
  limit: 200,
  ...(filters.actor ? { actor: filters.actor } : {}),
  ...(filters.entity_type ? { entity_type: filters.entity_type } : {})
}))
const { data, status, error } = useAsyncData('workActivityAdmin',
  () => $fetch<any[]>('/api/work/v1/activity', { query: query.value }),
  { server: false, watch: [query], default: () => [] })

const panelTaskId = ref<string | null>(null)
const panelOpen = ref(false)
function openTask(id: string) { panelTaskId.value = id; panelOpen.value = true }

const entityItems = [
  { label: 'All entities', value: '' }, { label: 'Tasks', value: 'task' },
  { label: 'Spaces', value: 'space' }, { label: 'Folders', value: 'folder' },
  { label: 'Lists', value: 'list' }, { label: 'Docs', value: 'doc' }
]
</script>

<template>
  <div>
    <PageHeader title="Activity" subtitle="Workspace-wide change trail" icon="i-lucide-history" />
    <div class="mb-3 flex flex-wrap gap-2">
      <UInput v-model="filters.actor" size="xs" icon="i-lucide-user" placeholder="Filter by actor…" class="w-48" />
      <USelect v-model="filters.entity_type" :items="entityItems" value-key="value" size="xs" class="w-36" />
    </div>
    <DataState :status="status" :error="error" :empty="!data?.length" empty-label="No activity recorded.">
      <div class="panel divide-y divide-hull/60">
        <div v-for="a in data" :key="a.id" class="flex items-baseline gap-2 px-3 py-2 text-sm">
          <span class="w-32 shrink-0 text-xs text-faint">{{ workDateTime(a.ts) }}</span>
          <span class="w-28 shrink-0 truncate font-medium text-foam">{{ a.actor }}</span>
          <span class="w-14 shrink-0 text-xs uppercase text-faint">{{ a.entity_type }}</span>
          <span class="min-w-0 flex-1 truncate text-(--color-muted)">
            {{ a.action }}<template v-if="a.field"> · {{ a.field }}</template>
            <template v-if="a.before_value || a.after_value">: <s v-if="a.before_value" class="text-faint">{{ a.before_value }}</s> → {{ a.after_value ?? '—' }}</template>
            <template v-else-if="a.detail"> · {{ a.detail }}</template>
            <template v-if="a.task_id">
              on <button class="text-beacon hover:underline" @click="openTask(a.task_id)">{{ a.custom_id || a.task_name || a.task_id }}</button>
            </template>
          </span>
        </div>
      </div>
    </DataState>
    <WorkTaskPanel v-model:open="panelOpen" :task-id="panelTaskId" @navigate="openTask" />
  </div>
</template>
