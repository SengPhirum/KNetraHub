<script setup lang="ts">
// Stacked avatar chips for a task's assignees (initials on stable colors).
const props = defineProps<{ assignees: { username: string }[]; max?: number }>()
const limit = computed(() => props.max ?? 4)
const shown = computed(() => props.assignees.slice(0, limit.value))
const extra = computed(() => props.assignees.length - shown.value.length)
</script>

<template>
  <div v-if="assignees.length" class="flex items-center -space-x-1.5">
    <span
      v-for="a in shown" :key="a.username" :title="a.username"
      class="flex size-5.5 items-center justify-center rounded-full text-[9px] font-semibold text-white ring-2 ring-(--ui-bg)"
      :style="{ backgroundColor: userColor(a.username) }"
    >{{ userInitials(a.username) }}</span>
    <span v-if="extra > 0" class="flex size-5.5 items-center justify-center rounded-full bg-surface text-[9px] text-faint ring-2 ring-(--ui-bg)">+{{ extra }}</span>
  </div>
  <span v-else class="text-xs text-faint">—</span>
</template>
