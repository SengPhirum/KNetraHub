<script setup lang="ts">
defineProps<{ status: string; error?: any; empty?: boolean; emptyLabel?: string; emptyIcon?: string }>()
</script>
<template>
  <div v-if="status === 'pending'" class="flex items-center justify-center py-20 text-[var(--color-muted)]">
    <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin mr-2" /> Loading…
  </div>
  <div v-else-if="status === 'error'" class="panel p-6 border-rose-500/30 bg-rose-500/5">
    <div class="flex items-start gap-3">
      <UIcon name="i-lucide-triangle-alert" class="size-5 text-rose-400 mt-0.5" />
      <div>
        <p class="font-medium text-rose-200">Couldn't load data</p>
        <p class="mt-1 text-sm text-[var(--color-muted)]">{{ error?.data?.statusMessage || error?.statusMessage || error?.message || 'Check that DockHub can reach a swarm manager.' }}</p>
      </div>
    </div>
  </div>
  <div v-else-if="empty" class="panel p-12 text-center">
    <UIcon :name="emptyIcon || 'i-lucide-inbox'" class="size-10 text-[var(--color-faint)] mx-auto" />
    <p class="mt-3 text-sm text-[var(--color-muted)]">{{ emptyLabel || 'Nothing here yet.' }}</p>
    <slot name="empty-action" />
  </div>
  <slot v-else />
</template>
