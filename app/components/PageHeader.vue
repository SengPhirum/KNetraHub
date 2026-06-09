<script setup lang="ts">
defineProps<{ title: string; subtitle?: string; icon?: string }>()
</script>
<template>
  <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
    <div class="flex items-start gap-3">
      <span v-if="icon" class="mt-0.5 flex size-10 items-center justify-center rounded-xl bg-[var(--color-surface)] ring-1 ring-[var(--color-hull)]">
        <UIcon :name="icon" class="size-5 text-[var(--color-beacon)]" />
      </span>
      <div>
        <h1 class="font-display text-2xl font-semibold tracking-tight text-[var(--color-foam)]">{{ title }}</h1>
        <p v-if="subtitle" class="mt-0.5 text-sm text-[var(--color-muted)]">{{ subtitle }}</p>
      </div>
    </div>
    <div class="flex items-center gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>
