<script setup lang="ts">
// Due date chip — red when overdue, amber when due today.
const props = defineProps<{ task: { due_at?: string | null; completed_at?: string | null } }>()
const state = computed(() => {
  if (!props.task.due_at) return 'none'
  if (props.task.completed_at) return 'done'
  const due = new Date(props.task.due_at)
  if (due.toDateString() === new Date().toDateString()) return 'today'
  return due.getTime() < Date.now() ? 'overdue' : 'future'
})
</script>

<template>
  <span
    v-if="task.due_at"
    class="inline-flex items-center gap-1 text-xs"
    :class="state === 'overdue' ? 'text-rose-400' : state === 'today' ? 'text-amber-400' : 'text-faint'"
  >
    <UIcon name="i-lucide-calendar" class="size-3.5" />
    {{ workShortDate(task.due_at) }}
  </span>
  <span v-else class="text-xs text-faint">—</span>
</template>
