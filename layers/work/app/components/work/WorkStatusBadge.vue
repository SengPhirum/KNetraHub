<script setup lang="ts">
// A task's status pill using the workflow's configured color.
defineProps<{ name?: string | null; color?: string | null; small?: boolean }>()
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-full font-medium ring-1 ring-inset"
    :class="small ? 'px-1.5 py-px text-[10px]' : 'px-2 py-0.5 text-xs'"
    :style="{ color: color || '#9ca3af', '--tw-ring-color': (color || '#9ca3af') + '55', backgroundColor: (color || '#9ca3af') + '1a' }"
  >
    <span class="size-1.5 rounded-full" :style="{ backgroundColor: color || '#9ca3af' }" />
    {{ name || 'No status' }}
  </span>
</template>
