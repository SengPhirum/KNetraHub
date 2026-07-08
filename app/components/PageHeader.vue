<script setup lang="ts">
defineProps<{ title: string; subtitle?: string; icon?: string }>()
</script>
<template>
  <div class="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
    <div class="flex min-w-0 shrink-0 items-center gap-2.5">
      <span v-if="icon" class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface ring-1 ring-hull">
        <UIcon :name="icon" class="size-4 text-beacon" />
      </span>
      <div class="min-w-0">
        <h1 class="truncate font-display text-xl font-semibold tracking-tight text-foam leading-tight">{{ title }}</h1>
        <p v-if="subtitle" class="mt-0.5 truncate text-xs leading-tight text-(--color-muted)">{{ subtitle }}</p>
      </div>
    </div>
    <div class="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
      <slot name="actions" />
    </div>
  </div>
</template>
