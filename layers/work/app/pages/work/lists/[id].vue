<script setup lang="ts">
// The core task workspace for one list: List (grouped by status), Board
// (kanban drag & drop), and Table views over the same canonical tasks, with
// filters, quick-create, and the full task panel.
const route = useRoute()
const listId = computed(() => String(route.params.id))
const { canCreate, canUpdate } = useWork()
const toast = useToast()

const { data: list, status: listStatus, error: listError, refresh: refreshList } = useAsyncData(
  () => `workList:${listId.value}`,
  () => $fetch<any>(`/api/work/v1/lists/${listId.value}`),
  { server: false, watch: [listId] }
)
const { data: members } = useAsyncData('workMembers',
  () => $fetch<any[]>('/api/work/v1/members'), { server: false, default: () => [] })

const viewMode = ref<'list' | 'board' | 'table'>('list')
const filters = reactive({
  assignee: '' as string, priority: '' as string, tagId: '' as string,
  includeClosed: false, includeDone: true, q: ''
})

const taskQuery = computed(() => ({
  list_id: listId.value,
  sort: 'order',
  limit: 200,
  include_closed: filters.includeClosed ? 'true' : 'false',
  exclude_done: filters.includeDone ? 'false' : 'true',
  ...(filters.assignee ? { assignee: filters.assignee } : {}),
  ...(filters.priority ? { priority: filters.priority } : {}),
  ...(filters.tagId ? { tag_id: filters.tagId } : {}),
  ...(filters.q ? { q: filters.q } : {})
}))
const { data: tasks, status, error, refresh } = useAsyncData(
  () => `workListTasks:${listId.value}`,
  () => $fetch<any>('/api/work/v1/tasks', { query: taskQuery.value }),
  { server: false, watch: [taskQuery], default: () => ({ items: [], total: 0 }) }
)

const statuses = computed(() => list.value?.statuses || [])
const topLevel = computed(() => (tasks.value?.items || []).filter((t: any) => !t.parent_id))
const groups = computed(() => statuses.value.map((s: any) => ({
  status: s,
  tasks: topLevel.value
    .filter((t: any) => t.status_id === s.id)
    .sort((a: any, b: any) => a.order_index - b.order_index || a.created_at.localeCompare(b.created_at))
})))

// Panel
const panelTaskId = ref<string | null>(null)
const panelOpen = ref(false)
function openTask(id: string) { panelTaskId.value = id; panelOpen.value = true }

// Quick create
const newTask = reactive({ name: '', statusId: '' })
const creating = ref(false)
async function createTask(statusId?: string) {
  const name = newTask.name.trim()
  if (!name) return
  creating.value = true
  try {
    await $fetch('/api/work/v1/tasks', {
      method: 'POST',
      body: { list_id: listId.value, name, status_id: statusId || newTask.statusId || undefined }
    })
    newTask.name = ''
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Could not create task', description: e?.data?.statusMessage || e?.message, color: 'error' })
  } finally { creating.value = false }
}
const boardCreateStatus = ref<string | null>(null)
const boardCreateName = ref('')
async function boardCreate() {
  if (!boardCreateName.value.trim() || !boardCreateStatus.value) return
  try {
    await $fetch('/api/work/v1/tasks', {
      method: 'POST',
      body: { list_id: listId.value, name: boardCreateName.value, status_id: boardCreateStatus.value }
    })
    boardCreateStatus.value = null
    boardCreateName.value = ''
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Could not create task', description: e?.data?.statusMessage || e?.message, color: 'error' })
  }
}

// Board drag & drop → PATCH canonical task
async function moveTask(payload: { taskId: string; statusId: string; orderIndex: number }) {
  const task = (tasks.value?.items || []).find((t: any) => t.id === payload.taskId)
  try {
    await $fetch(`/api/work/v1/tasks/${payload.taskId}`, {
      method: 'PATCH',
      body: { status_id: payload.statusId, order_index: payload.orderIndex, version: task?.version }
    })
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Could not move task', description: e?.data?.statusMessage || e?.message, color: 'error' })
    await refresh()
  }
}

const assigneeItems = computed(() => [
  { label: 'Anyone', value: '' }, { label: 'Me', value: 'me' },
  ...(members.value || []).map((m: any) => ({ label: m.username, value: m.username }))
])
const priorityItems = [
  { label: 'Any priority', value: '' }, { label: 'Urgent', value: 'urgent' },
  { label: 'High', value: 'high' }, { label: 'Normal', value: 'normal' }, { label: 'Low', value: 'low' }
]
const tagFilterItems = computed(() => [
  { label: 'Any tag', value: '' },
  ...(list.value?.tags || []).map((t: any) => ({ label: t.name, value: t.id }))
])

async function favorite() {
  try {
    const result = await $fetch<any>('/api/work/v1/favorites', { method: 'POST', body: { entity_type: 'list', entity_id: listId.value } })
    toast.add({ title: result.favorited ? 'Added to favorites' : 'Removed from favorites', color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'Could not update favorites', description: e?.data?.statusMessage || e?.message, color: 'error' })
  }
}
</script>

<template>
  <div>
    <DataState :status="listStatus" :error="listError">
      <template v-if="list">
        <div class="mb-1 flex items-center gap-1 text-xs text-faint">
          <NuxtLink to="/work/spaces" class="hover:text-foam">Spaces</NuxtLink>
          <UIcon name="i-lucide-chevron-right" class="size-3" />
          <NuxtLink :to="`/work/spaces/${list.space.id}`" class="hover:text-foam">{{ list.space.name }}</NuxtLink>
          <template v-if="list.folder">
            <UIcon name="i-lucide-chevron-right" class="size-3" />
            <span>{{ list.folder.name }}</span>
          </template>
        </div>
        <PageHeader :title="list.name" :subtitle="list.description || `${tasks?.total ?? 0} task(s)`" :icon="list.icon || 'i-lucide-list'">
          <template #actions>
            <UButton size="sm" variant="ghost" color="neutral" icon="i-lucide-star" title="Favorite" @click="favorite" />
            <div class="flex rounded-lg bg-surface p-0.5 ring-1 ring-hull">
              <UButton
                v-for="m in [
                  { key: 'list', icon: 'i-lucide-list', label: 'List' },
                  { key: 'board', icon: 'i-lucide-kanban', label: 'Board' },
                  { key: 'table', icon: 'i-lucide-table', label: 'Table' }
                ]" :key="m.key"
                size="xs" :variant="viewMode === m.key ? 'soft' : 'ghost'" :color="viewMode === m.key ? 'primary' : 'neutral'"
                :icon="m.icon" @click="viewMode = m.key as any"
              >{{ m.label }}</UButton>
            </div>
          </template>
        </PageHeader>

        <!-- Filters -->
        <div class="mb-3 flex flex-wrap items-center gap-2">
          <UInput v-model="filters.q" size="xs" icon="i-lucide-search" placeholder="Filter tasks…" class="w-48" />
          <USelect v-model="filters.assignee" :items="assigneeItems" value-key="value" size="xs" class="w-32" />
          <USelect v-model="filters.priority" :items="priorityItems" value-key="value" size="xs" class="w-32" />
          <USelect v-model="filters.tagId" :items="tagFilterItems" value-key="value" size="xs" class="w-32" />
          <UCheckbox v-model="filters.includeDone" label="Done" :ui="{ label: 'text-xs' }" />
          <UCheckbox v-model="filters.includeClosed" label="Closed" :ui="{ label: 'text-xs' }" />
        </div>

        <DataState :status="status" :error="error">
          <!-- LIST VIEW -->
          <div v-if="viewMode === 'list'" class="space-y-4">
            <div v-for="group in groups" :key="group.status.id">
              <div class="mb-1 flex items-center gap-2 px-1">
                <WorkStatusBadge :name="group.status.name" :color="group.status.color" />
                <span class="text-xs text-faint">{{ group.tasks.length }}</span>
              </div>
              <div class="panel divide-y divide-hull/60 p-1">
                <template v-for="t in group.tasks" :key="t.id">
                  <WorkTaskRow :task="t" @open="openTask" />
                  <WorkTaskRow
                    v-for="sub in (tasks?.items || []).filter((x: any) => x.parent_id === t.id)"
                    :key="sub.id" :task="sub" class="pl-8" @open="openTask"
                  />
                </template>
                <p v-if="!group.tasks.length" class="px-3 py-2 text-xs text-faint">No tasks</p>
              </div>
            </div>
            <div v-if="canCreate" class="flex gap-2">
              <UInput v-model="newTask.name" size="sm" class="flex-1" placeholder="New task… (Enter to add)" @keydown.enter="createTask()" />
              <USelect v-model="newTask.statusId" :items="[{ label: 'Default status', value: '' }, ...statuses.map((s: any) => ({ label: s.name, value: s.id }))]" value-key="value" size="sm" class="w-36" />
              <UButton size="sm" icon="i-lucide-plus" :loading="creating" @click="createTask()">Add task</UButton>
            </div>
          </div>

          <!-- BOARD VIEW -->
          <WorkBoard
            v-else-if="viewMode === 'board'"
            :tasks="topLevel" :statuses="statuses" :can-drag="canUpdate"
            @open="openTask" @move="moveTask" @create="(sid: string) => { boardCreateStatus = sid }"
          />

          <!-- TABLE VIEW -->
          <div v-else class="panel overflow-x-auto">
            <table class="w-full min-w-200 text-sm">
              <thead>
                <tr class="border-b border-hull text-left text-xs uppercase tracking-wide text-faint">
                  <th class="px-3 py-2">ID</th>
                  <th class="px-3 py-2">Name</th>
                  <th class="px-3 py-2">Status</th>
                  <th class="px-3 py-2">Assignees</th>
                  <th class="px-3 py-2">Due</th>
                  <th class="px-3 py-2">Priority</th>
                  <th class="px-3 py-2">Tags</th>
                  <th class="px-3 py-2">Estimate</th>
                  <th class="px-3 py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="t in tasks?.items || []" :key="t.id"
                  class="cursor-pointer border-b border-hull/50 transition hover:bg-surface"
                  @click="openTask(t.id)"
                >
                  <td class="px-3 py-2 font-mono text-xs text-faint">{{ t.custom_id || '—' }}</td>
                  <td class="px-3 py-2" :class="t.parent_id ? 'pl-8' : ''">
                    <span :class="t.completed_at ? 'text-faint line-through' : 'text-foam'">{{ t.name }}</span>
                  </td>
                  <td class="px-3 py-2"><WorkStatusBadge :name="t.status_name" :color="t.status_color" small /></td>
                  <td class="px-3 py-2"><WorkAssignees :assignees="t.assignees || []" /></td>
                  <td class="px-3 py-2"><WorkDueDate :task="t" /></td>
                  <td class="px-3 py-2"><WorkPriority :priority="t.priority" show-label /></td>
                  <td class="px-3 py-2">
                    <span v-for="tag in (t.tags || []).slice(0, 3)" :key="tag.id" class="mr-1 rounded-full px-1.5 py-px text-[10px] ring-1 ring-inset" :style="{ color: tag.color, '--tw-ring-color': tag.color + '55', backgroundColor: tag.color + '1a' }">{{ tag.name }}</span>
                  </td>
                  <td class="px-3 py-2 text-xs text-faint">{{ formatEstimate(t.time_estimate_minutes) }}</td>
                  <td class="px-3 py-2 text-xs text-faint">{{ workShortDate(t.created_at) }}</td>
                </tr>
              </tbody>
            </table>
            <p v-if="!(tasks?.items || []).length" class="p-4 text-center text-sm text-faint">No tasks match the filters.</p>
          </div>
        </DataState>

        <!-- Board quick-create modal -->
        <UModal :open="!!boardCreateStatus" title="New task" @update:open="(v: boolean) => !v && (boardCreateStatus = null)">
          <template #body>
            <UInput v-model="boardCreateName" placeholder="Task name" class="w-full" @keydown.enter="boardCreate" />
          </template>
          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton color="neutral" variant="ghost" @click="boardCreateStatus = null">Cancel</UButton>
              <UButton :disabled="!boardCreateName.trim()" @click="boardCreate">Create</UButton>
            </div>
          </template>
        </UModal>

        <WorkTaskPanel v-model:open="panelOpen" :task-id="panelTaskId" @updated="refresh(); refreshList()" @navigate="openTask" />
      </template>
    </DataState>
  </div>
</template>
