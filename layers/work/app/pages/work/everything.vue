<script setup lang="ts">
// Everything: workspace-wide task table with filters and cursor pagination.
const { data: members } = useAsyncData('workMembers',
  () => $fetch<any[]>('/api/work/v1/members'), { server: false, default: () => [] })

const filters = reactive({ assignee: '', priority: '', q: '', includeClosed: false, overdue: false })
const items = ref<any[]>([])
const total = ref(0)
const cursor = ref<string | null>(null)
const loading = ref(false)
const loadError = ref<any>(null)

const query = computed(() => ({
  sort: 'created',
  limit: 50,
  include_closed: filters.includeClosed ? 'true' : 'false',
  ...(filters.assignee ? { assignee: filters.assignee } : {}),
  ...(filters.priority ? { priority: filters.priority } : {}),
  ...(filters.q ? { q: filters.q } : {}),
  ...(filters.overdue ? { overdue: 'true' } : {})
}))

async function load(more = false) {
  if (import.meta.server) return
  loading.value = true
  loadError.value = null
  try {
    const result = await $fetch<any>('/api/work/v1/tasks', {
      query: { ...query.value, ...(more && cursor.value ? { cursor: cursor.value } : {}) }
    })
    items.value = more ? [...items.value, ...result.items] : result.items
    total.value = result.total
    cursor.value = result.nextCursor
  } catch (e) {
    loadError.value = e
  } finally { loading.value = false }
}
watch(query, () => { cursor.value = null; load(false) }, { immediate: true })

const panelTaskId = ref<string | null>(null)
const panelOpen = ref(false)
function openTask(id: string) { panelTaskId.value = id; panelOpen.value = true }

const assigneeItems = computed(() => [
  { label: 'Anyone', value: '' }, { label: 'Me', value: 'me' },
  ...(members.value || []).map((m: any) => ({ label: m.username, value: m.username }))
])
const priorityItems = [
  { label: 'Any priority', value: '' }, { label: 'Urgent', value: 'urgent' },
  { label: 'High', value: 'high' }, { label: 'Normal', value: 'normal' }, { label: 'Low', value: 'low' }
]
</script>

<template>
  <div>
    <PageHeader title="Everything" :subtitle="`All tasks across your visible spaces — ${total} matching`" icon="i-lucide-list-checks" />

    <div class="mb-3 flex flex-wrap items-center gap-2">
      <UInput v-model="filters.q" size="xs" icon="i-lucide-search" placeholder="Search tasks…" class="w-56" />
      <USelect v-model="filters.assignee" :items="assigneeItems" value-key="value" size="xs" class="w-36" />
      <USelect v-model="filters.priority" :items="priorityItems" value-key="value" size="xs" class="w-32" />
      <UCheckbox v-model="filters.overdue" label="Overdue only" :ui="{ label: 'text-xs' }" />
      <UCheckbox v-model="filters.includeClosed" label="Include closed" :ui="{ label: 'text-xs' }" />
    </div>

    <DataState :status="loading && !items.length ? 'pending' : loadError ? 'error' : 'success'" :error="loadError" :empty="!items.length" empty-label="No tasks match.">
      <div class="panel divide-y divide-hull/60 p-1">
        <WorkTaskRow v-for="t in items" :key="t.id" :task="t" show-location @open="openTask" />
      </div>
      <div v-if="cursor" class="mt-3 text-center">
        <UButton size="sm" variant="soft" :loading="loading" @click="load(true)">Load more</UButton>
      </div>
    </DataState>

    <WorkTaskPanel v-model:open="panelOpen" :task-id="panelTaskId" @updated="load(false)" @navigate="openTask" />
  </div>
</template>
