<script setup lang="ts">
defineProps<{ status: string; error?: any; empty?: boolean; emptyLabel?: string; emptyIcon?: string; refreshing?: boolean }>()
</script>

<template>
  <div v-if="status === 'pending'" class="space-y-2">
    <div v-for="i in 5" :key="i" class="skeleton h-14 rounded-lg" :style="{ opacity: 1 - i * 0.15 }" />
  </div>
  <div v-else-if="status === 'error'" class="panel p-6 border-rose-500/30 bg-rose-500/5">
    <div class="flex items-start gap-3">
      <UIcon name="i-lucide-triangle-alert" class="size-5 text-rose-400 mt-0.5" />
      <div>
        <p class="font-medium text-rose-200">Couldn't load data</p>
        <p class="mt-1 text-sm text-(--color-muted)">{{ error?.data?.statusMessage || error?.statusMessage || error?.message || 'Check that DockHub can reach a swarm manager.' }}</p>
      </div>
    </div>
  </div>
  <div v-else-if="empty" class="panel p-12 text-center">
    <UIcon :name="emptyIcon || 'i-lucide-inbox'" class="size-10 text-faint mx-auto" />
    <p class="mt-3 text-sm text-(--color-muted)">{{ emptyLabel || 'Nothing here yet.' }}</p>
    <slot name="empty-action" />
  </div>
  <div v-else class="relative">
    <!-- subtle top-line progress during background refresh -->
    <div v-if="refreshing" class="absolute inset-x-0 -top-px h-px overflow-hidden rounded-t-lg z-10">
      <div class="h-full w-1/3 bg-beacon animate-[slide_1.2s_ease-in-out_infinite]" />
    </div>
    <slot />
  </div>
</template>

<style scoped>
@keyframes slide {
  0%   { transform: translateX(-100%) scaleX(1); }
  60%  { transform: translateX(200%) scaleX(1.4); }
  100% { transform: translateX(400%) scaleX(1); }
}
</style>
