<script setup lang="ts">
const props = defineProps<{ status?: string | null }>()
const meta = computed(() => ipStatusMeta(props.status))
</script>
<template>
  <span class="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium" :class="meta.badge">
    <span class="size-1.5 rounded-full" :class="meta.dot" />
    {{ meta.label }}
  </span>
</template>
