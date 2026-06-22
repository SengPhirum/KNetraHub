<script setup lang="ts">
defineProps<{ title: string; subtitle?: string; icon?: string }>()
</script>
<template>
  <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div class="flex min-w-0 shrink-0 items-start gap-3">
      <span v-if="icon" class="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface ring-1 ring-hull">
        <UIcon :name="icon" class="size-5 text-beacon" />
      </span>
      <div class="min-w-0">
        <h1 class="truncate font-display text-2xl font-semibold tracking-tight text-foam">{{ title }}</h1>
        <p v-if="subtitle" class="mt-0.5 truncate text-sm text-(--color-muted)">{{ subtitle }}</p>
      </div>
    </div>
    <div class="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
      <slot name="actions" />
    </div>
  </div>
</template>
