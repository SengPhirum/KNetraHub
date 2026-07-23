<script setup lang="ts">
// One task row for list-style views: status, id, name, tags, subtask/comment
// counters, assignees, due date, priority. Click opens the task panel.
defineProps<{ task: any; showLocation?: boolean }>()
defineEmits<{ open: [taskId: string] }>()
</script>

<template>
  <button
    class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-surface"
    @click="$emit('open', task.id)"
  >
    <span class="size-2.5 shrink-0 rounded-full" :style="{ backgroundColor: task.status_color || '#9ca3af' }" :title="task.status_name || 'No status'" />
    <span v-if="task.custom_id" class="shrink-0 font-mono text-[11px] text-faint">{{ task.custom_id }}</span>
    <span class="min-w-0 flex-1 truncate text-sm" :class="task.completed_at ? 'text-faint line-through' : 'text-foam'">
      {{ task.name }}
    </span>
    <span v-if="showLocation" class="hidden shrink-0 truncate text-xs text-faint sm:block max-w-40">{{ task.space_name }} / {{ task.list_name }}</span>
    <span v-if="task.subtask_count" class="flex shrink-0 items-center gap-0.5 text-[11px] text-faint" title="Subtasks">
      <UIcon name="i-lucide-git-branch" class="size-3" />{{ task.subtask_done }}/{{ task.subtask_count }}
    </span>
    <span v-if="task.comment_count" class="flex shrink-0 items-center gap-0.5 text-[11px] text-faint" title="Comments">
      <UIcon name="i-lucide-message-circle" class="size-3" />{{ task.comment_count }}
    </span>
    <span v-for="tag in (task.tags || []).slice(0, 2)" :key="tag.id" class="hidden shrink-0 rounded-full px-1.5 py-px text-[10px] ring-1 ring-inset md:inline" :style="{ color: tag.color, '--tw-ring-color': tag.color + '55', backgroundColor: tag.color + '1a' }">
      {{ tag.name }}
    </span>
    <WorkAssignees :assignees="task.assignees || []" :max="3" class="shrink-0" />
    <span class="w-20 shrink-0 text-right"><WorkDueDate :task="task" /></span>
    <span class="w-6 shrink-0 text-center"><WorkPriority :priority="task.priority" /></span>
  </button>
</template>
