<script setup lang="ts">
// Kanban board: one column per status, native HTML5 drag & drop. Dropping a
// card emits `move` with the new status and a midpoint order_index; the page
// PATCHes the canonical task (views never keep divergent copies).
const props = defineProps<{ tasks: any[]; statuses: any[]; canDrag?: boolean }>()
const emit = defineEmits<{ open: [taskId: string]; move: [payload: { taskId: string; statusId: string; orderIndex: number }]; create: [statusId: string] }>()

const draggingId = ref<string | null>(null)
const dropTarget = ref<string | null>(null)

const columns = computed(() => props.statuses.map((status) => ({
  ...status,
  tasks: props.tasks
    .filter((t) => t.status_id === status.id)
    .sort((a, b) => a.order_index - b.order_index || a.created_at.localeCompare(b.created_at))
})))

function onDrop(status: any, beforeTask: any | null) {
  if (!draggingId.value) return
  const column = columns.value.find((c) => c.id === status.id)
  const list = (column?.tasks || []).filter((t: any) => t.id !== draggingId.value)
  let orderIndex: number
  if (!list.length) orderIndex = Date.now()
  else if (!beforeTask) orderIndex = (list[list.length - 1]!.order_index || 0) + 1000
  else {
    const idx = list.findIndex((t: any) => t.id === beforeTask.id)
    const prev = idx > 0 ? list[idx - 1]!.order_index : (list[0]!.order_index || 0) - 2000
    orderIndex = (prev + beforeTask.order_index) / 2
  }
  emit('move', { taskId: draggingId.value, statusId: status.id, orderIndex })
  draggingId.value = null
  dropTarget.value = null
}
</script>

<template>
  <div class="flex gap-3 overflow-x-auto pb-2">
    <div
      v-for="col in columns" :key="col.id"
      class="w-72 shrink-0 rounded-xl bg-surface/40 p-2 ring-1 ring-hull transition"
      :class="dropTarget === col.id ? 'ring-beacon/60' : ''"
      @dragover.prevent="dropTarget = col.id"
      @dragleave="dropTarget === col.id && (dropTarget = null)"
      @drop.prevent="onDrop(col, null)"
    >
      <div class="mb-2 flex items-center gap-2 px-1">
        <span class="size-2.5 rounded-full" :style="{ backgroundColor: col.color }" />
        <span class="text-sm font-medium text-foam">{{ col.name }}</span>
        <span class="text-xs text-faint">{{ col.tasks.length }}</span>
        <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-plus" class="ml-auto" title="Add task" @click="emit('create', col.id)" />
      </div>
      <div class="space-y-2 min-h-16">
        <div
          v-for="t in col.tasks" :key="t.id"
          class="cursor-pointer rounded-lg bg-(--ui-bg) p-2.5 ring-1 ring-hull transition hover:ring-beacon/40"
          :class="draggingId === t.id ? 'opacity-40' : ''"
          :draggable="canDrag !== false"
          @dragstart="draggingId = t.id"
          @dragend="draggingId = null"
          @dragover.prevent.stop="dropTarget = col.id"
          @drop.prevent.stop="onDrop(col, t)"
          @click="emit('open', t.id)"
        >
          <div class="mb-1.5 flex items-start gap-1.5">
            <span v-if="t.custom_id" class="shrink-0 font-mono text-[10px] text-faint">{{ t.custom_id }}</span>
            <p class="min-w-0 flex-1 text-sm leading-snug" :class="t.completed_at ? 'text-faint line-through' : 'text-foam'">{{ t.name }}</p>
          </div>
          <div class="flex flex-wrap items-center gap-1 mb-1.5">
            <span v-for="tag in (t.tags || []).slice(0, 3)" :key="tag.id" class="rounded-full px-1.5 py-px text-[10px] ring-1 ring-inset" :style="{ color: tag.color, '--tw-ring-color': tag.color + '55', backgroundColor: tag.color + '1a' }">
              {{ tag.name }}
            </span>
          </div>
          <div class="flex items-center gap-2">
            <WorkAssignees :assignees="t.assignees || []" :max="3" />
            <span class="flex-1" />
            <span v-if="t.subtask_count" class="flex items-center gap-0.5 text-[10px] text-faint">
              <UIcon name="i-lucide-git-branch" class="size-3" />{{ t.subtask_done }}/{{ t.subtask_count }}
            </span>
            <WorkDueDate :task="t" />
            <WorkPriority :priority="t.priority" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
