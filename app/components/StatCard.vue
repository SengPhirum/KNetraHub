<script setup lang="ts">
defineProps<{ label: string; value: string | number; icon?: string; hint?: string; accent?: boolean }>()
</script>
<template>
  <div class="panel p-4 flex items-start justify-between">
    <div>
      <p class="text-xs font-medium uppercase tracking-wider text-[var(--color-faint)]">{{ label }}</p>
      <p class="mt-1.5 font-display text-2xl font-semibold" :class="accent ? 'text-[var(--color-beacon)]' : 'text-[var(--color-foam)]'">{{ value }}</p>
      <p v-if="hint" class="mt-0.5 text-xs text-[var(--color-muted)]">{{ hint }}</p>
    </div>
    <span v-if="icon" class="flex size-9 items-center justify-center rounded-lg bg-[var(--color-surface-2)]">
      <UIcon :name="icon" class="size-5 text-[var(--color-muted)]" />
    </span>
  </div>
</template>
