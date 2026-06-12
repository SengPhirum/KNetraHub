<script setup lang="ts">
const props = defineProps<{
  navConfig: Array<{
    id: string
    label: string
    icon: string
    subs: Array<{ id: string; label: string; icon: string }>
  }>
  activeSection: string
}>()

const emit = defineEmits<{
  navigate: [section: string, anchor?: string]
}>()
</script>

<template>
  <div class="flex flex-col h-full py-3 px-2">
    <!-- Navigation -->
    <nav class="flex-1 space-y-px mt-2 overflow-y-auto">
      <template v-for="item in navConfig" :key="item.id">
        <button
          :class="[
            'flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm font-medium text-left transition-all duration-100',
            activeSection === item.id
              ? 'text-beacon bg-beacon/10'
              : 'text-muted hover:text-foam hover:bg-hull/50'
          ]"
          @click="emit('navigate', item.id)"
        >
          <UIcon :name="item.icon" class="size-4 shrink-0" />
          <span>{{ item.label }}</span>
        </button>

        <!-- Sub-items (visible when section is active) -->
        <div
          v-if="item.subs.length"
          class="overflow-hidden transition-all duration-200 ml-2 pl-3 border-l border-hull-soft"
          :style="activeSection === item.id ? 'max-height: 500px; margin-bottom: 4px;' : 'max-height: 0;'"
        >
          <button
            v-for="sub in item.subs"
            :key="sub.id"
            class="flex items-center gap-1.5 w-full px-1.5 py-1 rounded text-xs text-faint hover:text-foam hover:bg-hull/40 text-left transition-colors"
            @click.stop="emit('navigate', item.id, sub.id)"
          >
            <UIcon :name="sub.icon" class="size-3.5 shrink-0" />
            <span>{{ sub.label }}</span>
          </button>
        </div>
      </template>
    </nav>

    <!-- Bottom github link -->
    <div class="mt-3 pt-3 border-t border-hull-soft">
      <a
        href="https://github.com/sengphirum"
        target="_blank"
        rel="noopener noreferrer"
        class="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs text-faint hover:text-foam hover:bg-hull/50 transition-colors"
      >
        <UIcon name="i-lucide-github" class="size-3.5" />
        <span>sengphirum</span>
      </a>
    </div>
  </div>
</template>
