<script setup lang="ts">
// Priority flag (urgent/high/normal/low) or a muted dash when unset.
const props = defineProps<{ priority?: string | null; showLabel?: boolean }>()
const meta = computed(() => priorityMeta(props.priority))
</script>

<template>
  <span v-if="meta" class="inline-flex items-center gap-1 text-xs" :class="meta.class" :title="meta.label">
    <UIcon :name="meta.icon" class="size-3.5" />
    <span v-if="showLabel">{{ meta.label }}</span>
  </span>
  <span v-else class="text-xs text-faint">—</span>
</template>
