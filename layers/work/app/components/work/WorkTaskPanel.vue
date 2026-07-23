<script setup lang="ts">
// Full task detail panel (slideover): inline edits for every core field,
// custom fields, checklists, subtasks, dependencies, comments, activity and
// time tracking. Every mutation PATCHes the API (optimistic-concurrency
// version included) and refreshes; `updated` tells the opener to refetch.
const props = defineProps<{ taskId: string | null }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ updated: []; deleted: []; navigate: [taskId: string] }>()

const { canUpdate, canCreate, canTrackTime, canComment } = useWork()
const { user: me } = useAuth()
const toast = useToast()
const currentId = computed(() => props.taskId)

const { data: task, status, error, refresh } = useAsyncData(
  () => `workTask:${currentId.value}`,
  () => currentId.value ? $fetch<any>(`/api/work/v1/tasks/${currentId.value}`) : Promise.resolve(null),
  { server: false, watch: [currentId] }
)
const { data: members } = useAsyncData('workMembers',
  () => $fetch<any[]>('/api/work/v1/members'), { server: false, default: () => [] })
const { data: listInfo } = useAsyncData(
  () => `workTaskList:${task.value?.list_id}`,
  () => task.value?.list_id ? $fetch<any>(`/api/work/v1/lists/${task.value.list_id}`) : Promise.resolve(null),
  { server: false, watch: [() => task.value?.list_id] }
)
const { data: timer, refresh: refreshTimer } = useAsyncData('workTimer',
  () => $fetch<any>('/api/work/v1/time/timer'), { server: false })

const nameDraft = ref('')
const descDraft = ref('')
const descDirty = ref(false)
watch(task, (t) => {
  if (t) { nameDraft.value = t.name; descDraft.value = t.description || ''; descDirty.value = false }
}, { immediate: true })

function fail(e: any, what: string) {
  toast.add({ title: `Could not ${what}`, description: e?.data?.statusMessage || e?.message, color: 'error' })
}

async function patch(body: Record<string, unknown>, what = 'update task') {
  if (!task.value) return
  try {
    const result = await $fetch<any>(`/api/work/v1/tasks/${task.value.id}`, {
      method: 'PATCH', body: { ...body, version: task.value.version }
    })
    for (const warning of result?.warnings || []) toast.add({ title: warning, color: 'warning' })
    await refresh()
    emit('updated')
  } catch (e: any) {
    fail(e, what)
    if (e?.statusCode === 409 || e?.data?.statusCode === 409) await refresh()
  }
}

async function saveName() {
  if (task.value && nameDraft.value.trim() && nameDraft.value !== task.value.name) {
    await patch({ name: nameDraft.value }, 'rename task')
  }
}
async function saveDescription() {
  await patch({ description: descDraft.value }, 'save description')
  descDirty.value = false
}

const statusItems = computed(() =>
  (listInfo.value?.statuses || []).map((s: any) => ({ label: s.name, value: s.id, color: s.color })))
const priorityItems = [
  { label: 'Urgent', value: 'urgent' }, { label: 'High', value: 'high' },
  { label: 'Normal', value: 'normal' }, { label: 'Low', value: 'low' }, { label: 'None', value: '' }
]
const { data: taskTypes } = useAsyncData('workTaskTypes',
  () => $fetch<any[]>('/api/work/v1/task-types'), { server: false, default: () => [] })
const typeItems = computed(() => (taskTypes.value || []).map((t: any) => ({ label: t.name, value: t.id })))

const memberItems = computed(() => (members.value || []).map((m: any) => m.username))
const assigneeSelection = computed({
  get: () => (task.value?.assignees || []).map((a: any) => a.username),
  set: (value: string[]) => { patch({ assignees: value }, 'update assignees') }
})
const tagItems = computed(() => (listInfo.value?.tags || []).map((t: any) => ({ label: t.name, value: t.id })))
const tagSelection = computed({
  get: () => (task.value?.tags || []).map((t: any) => t.id),
  set: (value: string[]) => { patch({ tags: value }, 'update tags') }
})

const toDateInput = (iso?: string | null) => iso ? String(iso).slice(0, 10) : ''
const startDate = computed({
  get: () => toDateInput(task.value?.start_at),
  set: (value: string) => { patch({ start_at: value || null }, 'set start date') }
})
const dueDate = computed({
  get: () => toDateInput(task.value?.due_at),
  set: (value: string) => { patch({ due_at: value || null }, 'set due date') }
})
const estimateDraft = ref('')
watch(task, (t) => { estimateDraft.value = t?.time_estimate_minutes != null ? String(t.time_estimate_minutes) : '' })
async function saveEstimate() {
  const value = estimateDraft.value === '' ? null : Number(estimateDraft.value)
  await patch({ time_estimate_minutes: value }, 'set estimate')
}

// Custom field edits (draft per field, save on change/blur).
const fieldDrafts = reactive<Record<string, any>>({})
watch(task, (t) => {
  for (const f of t?.custom_fields || []) fieldDrafts[f.id] = f.value
}, { immediate: true })
async function saveField(field: any) {
  await patch({ custom_fields: { [field.id]: fieldDrafts[field.id] } }, `save ${field.name}`)
}

// Subtasks
const newSubtask = ref('')
async function addSubtask() {
  if (!newSubtask.value.trim() || !task.value) return
  try {
    await $fetch('/api/work/v1/tasks', {
      method: 'POST',
      body: { list_id: task.value.list_id, parent_id: task.value.id, name: newSubtask.value }
    })
    newSubtask.value = ''
    await refresh()
    emit('updated')
  } catch (e: any) { fail(e, 'add subtask') }
}

// Dependencies — search-and-add
const depQuery = ref('')
const depDirection = ref<'waiting_on' | 'blocking'>('waiting_on')
const depResults = ref<any[]>([])
let depTimer: ReturnType<typeof setTimeout> | undefined
watch(depQuery, (q) => {
  clearTimeout(depTimer)
  if (!q || q.length < 2) { depResults.value = []; return }
  depTimer = setTimeout(async () => {
    try {
      const result = await $fetch<any>('/api/work/v1/tasks', { query: { q, limit: 8, include_closed: 'true' } })
      depResults.value = (result.items || []).filter((t: any) => t.id !== task.value?.id)
    } catch { depResults.value = [] }
  }, 250)
})
async function addDependency(other: any) {
  try {
    await $fetch(`/api/work/v1/tasks/${task.value.id}/dependencies`, {
      method: 'POST', body: { task_id: other.id, direction: depDirection.value }
    })
    depQuery.value = ''
    depResults.value = []
    await refresh()
  } catch (e: any) { fail(e, 'add dependency') }
}
async function removeDependency(dep: any) {
  try {
    await $fetch(`/api/work/v1/dependencies/${dep.dependency_id}`, { method: 'DELETE' })
    await refresh()
  } catch (e: any) { fail(e, 'remove dependency') }
}

// Time tracking
const manualMinutes = ref('')
async function startTimer() {
  try {
    await $fetch('/api/work/v1/time/timer/start', { method: 'POST', body: { task_id: task.value.id } })
    await Promise.all([refreshTimer(), refresh()])
  } catch (e: any) { fail(e, 'start timer') }
}
async function stopTimer() {
  try {
    await $fetch('/api/work/v1/time/timer/stop', { method: 'POST', body: {} })
    await Promise.all([refreshTimer(), refresh()])
  } catch (e: any) { fail(e, 'stop timer') }
}
async function addManualTime() {
  const minutes = Number(manualMinutes.value)
  if (!Number.isFinite(minutes) || minutes <= 0) return
  try {
    await $fetch(`/api/work/v1/tasks/${task.value.id}/time`, {
      method: 'POST', body: { duration_seconds: Math.round(minutes * 60) }
    })
    manualMinutes.value = ''
    await refresh()
  } catch (e: any) { fail(e, 'log time') }
}
const timerOnThisTask = computed(() => timer.value && timer.value.task_id === task.value?.id)

// Actions
async function duplicate() {
  try {
    const result = await $fetch<any>(`/api/work/v1/tasks/${task.value.id}/duplicate`, { method: 'POST' })
    toast.add({ title: 'Task duplicated', color: 'success' })
    emit('updated')
    emit('navigate', result.id)
  } catch (e: any) { fail(e, 'duplicate task') }
}
async function archive() { await patch({ archived: !task.value.archived_at }, 'archive task') }
async function removeTask() {
  try {
    await $fetch(`/api/work/v1/tasks/${task.value.id}`, { method: 'DELETE' })
    toast.add({ title: 'Task deleted', description: 'It can be restored from the API within its list.', color: 'success' })
    open.value = false
    emit('deleted')
    emit('updated')
  } catch (e: any) { fail(e, 'delete task') }
}
const isFollowing = computed(() =>
  (task.value?.followers || []).includes(me.value?.username?.toLowerCase()))
async function toggleFollow() { await patch({ follow: !isFollowing.value }, 'update watching') }

// Activity tab
const tab = ref('comments')
const { data: activity, refresh: refreshActivity } = useAsyncData(
  () => `workTaskActivity:${currentId.value}`,
  () => currentId.value && tab.value === 'activity'
    ? $fetch<any[]>(`/api/work/v1/tasks/${currentId.value}/activity`)
    : Promise.resolve([]),
  { server: false, watch: [currentId, tab], default: () => [] }
)
const { data: timeEntries, refresh: refreshTime } = useAsyncData(
  () => `workTaskTime:${currentId.value}`,
  () => currentId.value && tab.value === 'time'
    ? $fetch<any[]>(`/api/work/v1/tasks/${currentId.value}/time`)
    : Promise.resolve([]),
  { server: false, watch: [currentId, tab], default: () => [] }
)
</script>

<template>
  <USlideover v-model:open="open" :ui="{ content: 'max-w-2xl' }">
    <template #content>
      <div class="flex h-full flex-col overflow-hidden">
        <DataState v-if="!task" :status="status" :error="error" class="p-4" />
        <template v-else>
          <!-- Header -->
          <div class="border-b border-hull p-4">
            <div class="mb-1 flex items-center gap-2 text-xs text-faint">
              <UIcon :name="task.type_icon || 'i-lucide-circle-check'" class="size-3.5" />
              <span v-if="task.custom_id" class="font-mono">{{ task.custom_id }}</span>
              <span class="truncate">{{ task.space_name }} / {{ task.list_name }}</span>
              <NuxtLink :to="`/work/tasks/${task.id}`" class="ml-auto text-beacon hover:underline" @click="open = false">Full page</NuxtLink>
            </div>
            <div class="flex items-start gap-2">
              <UInput
                v-model="nameDraft" :disabled="!canUpdate" size="lg" class="flex-1"
                variant="none" :ui="{ base: 'font-display text-lg font-semibold px-0' }"
                @blur="saveName" @keydown.enter="saveName"
              />
              <UDropdownMenu :items="[[
                { label: isFollowing ? 'Unfollow' : 'Follow', icon: 'i-lucide-bell', onSelect: toggleFollow },
                { label: 'Duplicate', icon: 'i-lucide-copy', onSelect: duplicate, disabled: !canCreate },
                { label: task.archived_at ? 'Unarchive' : 'Archive', icon: 'i-lucide-archive', onSelect: archive, disabled: !canUpdate },
                { label: 'Delete', icon: 'i-lucide-trash-2', color: 'error', onSelect: removeTask, disabled: !canUpdate }
              ]]">
                <UButton size="sm" variant="ghost" color="neutral" icon="i-lucide-ellipsis-vertical" />
              </UDropdownMenu>
            </div>
            <p v-if="task.archived_at" class="mt-1 rounded bg-amber-500/10 px-2 py-1 text-xs text-amber-400 ring-1 ring-inset ring-amber-500/30">
              This task is archived.
            </p>
          </div>

          <div class="flex-1 space-y-5 overflow-y-auto p-4">
            <!-- Core fields -->
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <UFormField label="Status">
                <USelect
                  :model-value="task.status_id" :items="statusItems" value-key="value" :disabled="!canUpdate"
                  class="w-full" @update:model-value="(v: any) => patch({ status_id: v }, 'change status')"
                />
              </UFormField>
              <UFormField label="Priority">
                <USelect
                  :model-value="task.priority || ''" :items="priorityItems" value-key="value" :disabled="!canUpdate"
                  class="w-full" @update:model-value="(v: any) => patch({ priority: v || null }, 'change priority')"
                />
              </UFormField>
              <UFormField label="Assignees">
                <USelectMenu v-model="assigneeSelection" :items="memberItems" multiple :disabled="!canUpdate" class="w-full" placeholder="Unassigned" />
              </UFormField>
              <UFormField label="Type">
                <USelect
                  :model-value="task.type_id" :items="typeItems" value-key="value" :disabled="!canUpdate"
                  class="w-full" placeholder="No type" @update:model-value="(v: any) => patch({ type_id: v }, 'change type')"
                />
              </UFormField>
              <UFormField label="Start date">
                <UInput v-model="startDate" type="date" :disabled="!canUpdate" class="w-full" />
              </UFormField>
              <UFormField label="Due date">
                <UInput v-model="dueDate" type="date" :disabled="!canUpdate" class="w-full" />
              </UFormField>
              <UFormField label="Estimate (minutes)">
                <UInput v-model="estimateDraft" type="number" min="0" :disabled="!canUpdate" class="w-full" @blur="saveEstimate" @keydown.enter="saveEstimate" />
              </UFormField>
              <UFormField label="Tags">
                <USelectMenu v-model="tagSelection" :items="tagItems" value-key="value" multiple :disabled="!canUpdate" class="w-full" placeholder="No tags" />
              </UFormField>
            </div>

            <!-- Time tracking -->
            <div v-if="canTrackTime" class="flex flex-wrap items-center gap-2 rounded-lg bg-surface/60 p-3 ring-1 ring-hull">
              <UIcon name="i-lucide-timer" class="size-4 text-beacon" />
              <span class="text-sm text-(--color-muted)">Tracked: <b class="text-foam">{{ formatDuration(task.time_tracked_seconds) }}</b></span>
              <span v-if="task.time_estimate_minutes" class="text-xs text-faint">/ est. {{ formatEstimate(task.time_estimate_minutes) }}</span>
              <span class="flex-1" />
              <UButton v-if="!timerOnThisTask" size="xs" variant="soft" icon="i-lucide-play" @click="startTimer">Start timer</UButton>
              <UButton v-else size="xs" color="error" variant="soft" icon="i-lucide-square" @click="stopTimer">Stop ({{ formatDuration(timer?.running_seconds) }})</UButton>
              <UInput v-model="manualMinutes" size="xs" type="number" min="1" placeholder="min" class="w-20" @keydown.enter="addManualTime" />
              <UButton size="xs" variant="ghost" icon="i-lucide-plus" title="Log manual time" @click="addManualTime" />
            </div>

            <!-- Description -->
            <UFormField label="Description">
              <UTextarea
                v-model="descDraft" :rows="5" :disabled="!canUpdate" class="w-full"
                placeholder="Add a description… (Markdown source is preserved verbatim)"
                @update:model-value="descDirty = true"
              />
              <div v-if="descDirty" class="mt-1 flex justify-end">
                <UButton size="xs" @click="saveDescription">Save description</UButton>
              </div>
            </UFormField>

            <!-- Custom fields -->
            <div v-if="task.custom_fields?.length" class="space-y-2">
              <p class="text-xs font-semibold uppercase tracking-wide text-faint">Custom fields</p>
              <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <UFormField v-for="f in task.custom_fields" :key="f.id" :label="f.name" :required="f.required">
                  <UCheckbox v-if="f.field_type === 'checkbox'" :model-value="fieldDrafts[f.id] === true" :disabled="!canUpdate" @update:model-value="(v: any) => { fieldDrafts[f.id] = v; saveField(f) }" />
                  <USelect v-else-if="f.field_type === 'dropdown'" v-model="fieldDrafts[f.id]" :items="(f.options || []).map((o: any) => ({ label: o.label, value: o.id }))" value-key="value" :disabled="!canUpdate" class="w-full" @update:model-value="saveField(f)" />
                  <USelectMenu v-else-if="f.field_type === 'labels'" v-model="fieldDrafts[f.id]" :items="(f.options || []).map((o: any) => ({ label: o.label, value: o.id }))" value-key="value" multiple :disabled="!canUpdate" class="w-full" @update:model-value="saveField(f)" />
                  <USelectMenu v-else-if="f.field_type === 'people'" v-model="fieldDrafts[f.id]" :items="memberItems" multiple :disabled="!canUpdate" class="w-full" @update:model-value="saveField(f)" />
                  <UInput v-else-if="['date','datetime'].includes(f.field_type)" v-model="fieldDrafts[f.id]" :type="f.field_type === 'date' ? 'date' : 'datetime-local'" :disabled="!canUpdate" class="w-full" @blur="saveField(f)" />
                  <UInput v-else-if="['number','currency','rating','progress'].includes(f.field_type)" v-model="fieldDrafts[f.id]" type="number" :disabled="!canUpdate" class="w-full" @blur="saveField(f)" />
                  <UTextarea v-else-if="f.field_type === 'textarea'" v-model="fieldDrafts[f.id]" :rows="2" :disabled="!canUpdate" class="w-full" @blur="saveField(f)" />
                  <UInput v-else v-model="fieldDrafts[f.id]" :disabled="!canUpdate" class="w-full" @blur="saveField(f)" @keydown.enter="saveField(f)" />
                </UFormField>
              </div>
            </div>

            <!-- Subtasks -->
            <div>
              <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
                Subtasks <span v-if="task.subtasks?.length">({{ task.subtask_done }}/{{ task.subtask_count }})</span>
              </p>
              <div class="space-y-1">
                <button
                  v-for="sub in task.subtasks" :key="sub.id"
                  class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-surface"
                  @click="emit('navigate', sub.id)"
                >
                  <span class="size-2 shrink-0 rounded-full" :style="{ backgroundColor: sub.status_color || '#9ca3af' }" />
                  <span class="flex-1 truncate text-sm" :class="sub.completed_at ? 'text-faint line-through' : 'text-(--color-muted)'">{{ sub.name }}</span>
                  <WorkAssignees :assignees="sub.assignees || []" :max="2" />
                  <WorkDueDate :task="sub" />
                </button>
              </div>
              <div v-if="canCreate" class="mt-2 flex gap-2">
                <UInput v-model="newSubtask" size="xs" class="flex-1" placeholder="Add subtask…" @keydown.enter="addSubtask" />
                <UButton size="xs" variant="soft" icon="i-lucide-plus" @click="addSubtask" />
              </div>
            </div>

            <!-- Dependencies -->
            <div>
              <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Dependencies</p>
              <div v-if="task.waiting_on?.length" class="mb-2">
                <p class="mb-1 text-xs text-amber-400">Waiting on</p>
                <div v-for="dep in task.waiting_on" :key="dep.dependency_id" class="group flex items-center gap-2 rounded px-2 py-1 hover:bg-surface">
                  <UIcon name="i-lucide-clock" class="size-3.5 text-amber-400" />
                  <button class="flex-1 truncate text-left text-sm text-(--color-muted) hover:text-foam" @click="emit('navigate', dep.id)">
                    {{ dep.custom_id ? `${dep.custom_id} · ` : '' }}{{ dep.name }}
                  </button>
                  <WorkStatusBadge :name="dep.status_name" :color="dep.status_color" small />
                  <UButton v-if="canUpdate" size="xs" variant="ghost" color="neutral" icon="i-lucide-x" class="opacity-0 group-hover:opacity-100" @click="removeDependency(dep)" />
                </div>
              </div>
              <div v-if="task.blocking?.length" class="mb-2">
                <p class="mb-1 text-xs text-rose-400">Blocking</p>
                <div v-for="dep in task.blocking" :key="dep.dependency_id" class="group flex items-center gap-2 rounded px-2 py-1 hover:bg-surface">
                  <UIcon name="i-lucide-ban" class="size-3.5 text-rose-400" />
                  <button class="flex-1 truncate text-left text-sm text-(--color-muted) hover:text-foam" @click="emit('navigate', dep.id)">
                    {{ dep.custom_id ? `${dep.custom_id} · ` : '' }}{{ dep.name }}
                  </button>
                  <WorkStatusBadge :name="dep.status_name" :color="dep.status_color" small />
                  <UButton v-if="canUpdate" size="xs" variant="ghost" color="neutral" icon="i-lucide-x" class="opacity-0 group-hover:opacity-100" @click="removeDependency(dep)" />
                </div>
              </div>
              <div v-if="canUpdate" class="flex gap-2">
                <USelect v-model="depDirection" :items="[{ label: 'Waiting on', value: 'waiting_on' }, { label: 'Blocking', value: 'blocking' }]" value-key="value" size="xs" class="w-32" />
                <div class="relative flex-1">
                  <UInput v-model="depQuery" size="xs" class="w-full" placeholder="Search tasks to link…" />
                  <div v-if="depResults.length" class="absolute inset-x-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-lg bg-(--ui-bg) p-1 shadow-lg ring-1 ring-hull">
                    <button
                      v-for="r in depResults" :key="r.id"
                      class="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-surface"
                      @click="addDependency(r)"
                    >
                      <span v-if="r.custom_id" class="font-mono text-xs text-faint">{{ r.custom_id }}</span>
                      <span class="truncate">{{ r.name }}</span>
                      <span class="ml-auto shrink-0 text-xs text-faint">{{ r.list_name }}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Checklists -->
            <div>
              <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Checklists</p>
              <WorkTaskChecklists :task="task" :members="members || []" @changed="refresh" />
            </div>

            <!-- Tabs: comments / activity / time -->
            <div>
              <div class="mb-2 flex gap-1 border-b border-hull">
                <button
                  v-for="t in [
                    { key: 'comments', label: `Comments (${task.comment_count})` },
                    { key: 'activity', label: 'Activity' },
                    { key: 'time', label: 'Time' }
                  ]" :key="t.key"
                  class="border-b-2 px-3 py-1.5 text-sm transition"
                  :class="tab === t.key ? 'border-beacon text-foam' : 'border-transparent text-faint hover:text-foam'"
                  @click="tab = t.key"
                >{{ t.label }}</button>
              </div>

              <WorkTaskComments v-if="tab === 'comments'" :task-id="task.id" :members="members || []" />

              <div v-else-if="tab === 'activity'" class="space-y-1.5">
                <div v-for="a in activity" :key="a.id" class="flex items-baseline gap-2 text-sm">
                  <span class="shrink-0 text-xs text-faint">{{ workDateTime(a.ts) }}</span>
                  <span class="font-medium text-foam">{{ a.actor }}</span>
                  <span class="text-(--color-muted)">
                    {{ a.action }}<template v-if="a.field"> · {{ a.field }}</template>
                    <template v-if="a.before_value || a.after_value">: <s v-if="a.before_value" class="text-faint">{{ a.before_value }}</s> → {{ a.after_value ?? '—' }}</template>
                    <template v-else-if="a.detail"> · {{ a.detail }}</template>
                  </span>
                </div>
                <p v-if="!activity?.length" class="text-sm text-faint">No activity recorded.</p>
              </div>

              <div v-else class="space-y-1.5">
                <div v-for="entry in timeEntries" :key="entry.id" class="flex items-center gap-2 text-sm">
                  <span class="flex size-5 items-center justify-center rounded-full text-[9px] font-semibold text-white" :style="{ backgroundColor: userColor(entry.username) }">{{ userInitials(entry.username) }}</span>
                  <span class="text-(--color-muted)">{{ workDateTime(entry.started_at) }}</span>
                  <span v-if="!entry.ended_at" class="rounded bg-emerald-500/10 px-1.5 text-[10px] text-emerald-400 ring-1 ring-inset ring-emerald-500/30">running</span>
                  <span class="ml-auto font-mono text-xs text-foam">{{ formatDuration(entry.effective_seconds) }}</span>
                  <span v-if="entry.billable" class="text-[10px] text-amber-400">billable</span>
                </div>
                <p v-if="!timeEntries?.length" class="text-sm text-faint">No time logged.</p>
              </div>
            </div>
          </div>
        </template>
      </div>
    </template>
  </USlideover>
</template>
