<script setup lang="ts">
type NavSub = { id?: string; label: string; icon?: string; heading?: boolean }
type NavItem = {
  id: string
  label: string
  icon: string
  external?: string
  subs: NavSub[]
}

defineProps<{
  navConfig: NavItem[]
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
        <!-- External items (e.g. Swagger UI) open in a new tab; internal items
             switch the active section in place. -->
        <component
          :is="item.external ? 'a' : 'button'"
          :href="item.external"
          :target="item.external ? '_blank' : undefined"
          :rel="item.external ? 'noopener noreferrer' : undefined"
          :class="[
            'flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm font-medium text-left transition-all duration-100',
            activeSection === item.id
              ? 'text-beacon bg-beacon/10'
              : 'text-muted hover:text-foam hover:bg-hull/50'
          ]"
          @click="item.external ? undefined : emit('navigate', item.id)"
        >
          <UIcon :name="item.icon" class="size-4 shrink-0" />
          <span>{{ item.label }}</span>
          <UIcon v-if="item.external" name="i-lucide-external-link" class="size-3.5 ml-auto shrink-0 opacity-60" />
        </component>

        <!-- Sub-items (visible when section is active) -->
        <div
          v-if="item.subs.length"
          class="overflow-hidden transition-all duration-200 ml-2 pl-3 border-l border-hull-soft"
          :style="activeSection === item.id ? 'max-height: 2200px; margin-bottom: 4px;' : 'max-height: 0;'"
        >
          <template v-for="(sub, i) in item.subs" :key="sub.id || `h-${i}`">
            <!-- Module group heading (non-clickable) -->
            <p
              v-if="sub.heading"
              class="px-1.5 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-faint/80 first:pt-0"
            >
              {{ sub.label }}
            </p>
            <!-- Clickable sub-item -->
            <button
              v-else
              class="flex items-center gap-1.5 w-full px-1.5 py-1 rounded text-xs text-faint hover:text-foam hover:bg-hull/40 text-left transition-colors"
              @click.stop="emit('navigate', item.id, sub.id)"
            >
              <UIcon v-if="sub.icon" :name="sub.icon" class="size-3.5 shrink-0" />
              <span>{{ sub.label }}</span>
            </button>
          </template>
        </div>
      </template>
    </nav>

  </div>
</template>
