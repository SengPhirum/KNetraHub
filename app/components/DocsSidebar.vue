<script setup lang="ts">
type NavSub = { id?: string; label: string; icon?: string; heading?: boolean }
type NavItem = {
  id: string
  label: string
  icon: string
  external?: string
  subs: NavSub[]
}

const props = withDefaults(defineProps<{
  navConfig: NavItem[]
  activeSection: string
  search?: string
}>(), {
  search: ''
})

const emit = defineEmits<{
  navigate: [section: string, anchor?: string]
  'update:search': [value: string]
}>()

const searchModel = computed({
  get: () => props.search,
  set: (value: string) => emit('update:search', value || '')
})

// ── Filter with auto-expand ───────────────────────────────────────────────────
// Typing filters the whole tree: sections whose sub-items match auto-expand to
// show only the matching entries (their group heading kept for context), a
// matching group heading reveals its whole group, and a matching section label
// expands the full section. Matched text is highlighted via highlightText.
const tokens = computed(() => props.search.trim().toLowerCase().split(/\s+/).filter(Boolean))

function matches(label: string) {
  const lower = label.toLowerCase()
  return tokens.value.every((t) => lower.includes(t))
}

type Row = { item: NavItem; subs: NavSub[]; expanded: boolean }

const rows = computed<Row[]>(() => {
  if (!tokens.value.length) {
    return props.navConfig.map((item) => ({
      item,
      subs: item.subs,
      expanded: props.activeSection === item.id
    }))
  }

  const out: Row[] = []
  for (const item of props.navConfig) {
    const subs: NavSub[] = []
    let pendingHeading: NavSub | null = null
    let groupMatched = false
    for (const sub of item.subs) {
      if (sub.heading) {
        groupMatched = matches(sub.label)
        pendingHeading = groupMatched ? null : sub
        if (groupMatched) subs.push(sub)
        continue
      }
      if (groupMatched || matches(sub.label)) {
        if (pendingHeading) {
          subs.push(pendingHeading)
          pendingHeading = null
        }
        subs.push(sub)
      }
    }

    if (subs.length) out.push({ item, subs, expanded: true })
    else if (matches(item.label)) out.push({ item, subs: item.subs, expanded: item.subs.length > 0 })
  }
  return out
})
</script>

<template>
  <div class="flex flex-col h-full py-3 px-2">
    <UInput
      v-model="searchModel"
      icon="i-lucide-search"
      placeholder="Search docs..."
      class="w-full"
      :ui="{ trailing: 'pe-1' }"
    >
      <template v-if="searchModel" #trailing>
        <button
          class="flex size-5 items-center justify-center rounded text-faint transition-colors hover:text-foam"
          aria-label="Clear search"
          @click="searchModel = ''"
        >
          <UIcon name="i-lucide-x" class="size-3.5" />
        </button>
      </template>
    </UInput>

    <!-- Navigation -->
    <nav class="docs-side-nav flex-1 space-y-px mt-2 overflow-y-auto">
      <template v-for="row in rows" :key="row.item.id">
        <!-- External items (e.g. Swagger UI) open in a new tab; internal items
             switch the active section in place. -->
        <component
          :is="row.item.external ? 'a' : 'button'"
          :href="row.item.external"
          :target="row.item.external ? '_blank' : undefined"
          :rel="row.item.external ? 'noopener noreferrer' : undefined"
          :class="[
            'flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm font-medium text-left transition-all duration-100',
            activeSection === row.item.id
              ? 'text-beacon bg-beacon/10'
              : 'text-muted hover:text-foam hover:bg-hull/50'
          ]"
          @click="row.item.external ? undefined : emit('navigate', row.item.id)"
        >
          <UIcon :name="row.item.icon" class="size-4 shrink-0" />
          <!-- highlightText escapes its input, so v-html is safe here -->
          <span v-html="highlightText(row.item.label, search)" />
          <UIcon v-if="row.item.external" name="i-lucide-external-link" class="size-3.5 ml-auto shrink-0 opacity-60" />
        </component>

        <!-- Sub-items (visible when section is active, or auto-expanded while searching) -->
        <div
          v-if="row.subs.length"
          class="overflow-hidden transition-all duration-200 ml-2 pl-3 border-l border-hull-soft"
          :style="row.expanded ? 'max-height: 2200px; margin-bottom: 4px;' : 'max-height: 0;'"
        >
          <template v-for="(sub, i) in row.subs" :key="sub.id || `h-${i}`">
            <!-- Module group heading (non-clickable) -->
            <p
              v-if="sub.heading"
              class="px-1.5 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-faint/80 first:pt-0"
              v-html="highlightText(sub.label, search)"
            />
            <!-- Clickable sub-item -->
            <button
              v-else
              class="flex items-center gap-1.5 w-full px-1.5 py-1 rounded text-xs text-faint hover:text-foam hover:bg-hull/40 text-left transition-colors"
              @click.stop="emit('navigate', row.item.id, sub.id)"
            >
              <UIcon v-if="sub.icon" :name="sub.icon" class="size-3.5 shrink-0" />
              <span v-html="highlightText(sub.label, search)" />
            </button>
          </template>
        </div>
      </template>

      <!-- Empty state while searching -->
      <div v-if="search && !rows.length" class="px-2 py-8 text-center">
        <UIcon name="i-lucide-search-x" class="mx-auto size-5 text-faint" />
        <p class="mt-2 text-xs text-faint">No menu matches “{{ search }}”</p>
        <button class="mt-2 text-xs font-medium text-beacon hover:underline" @click="searchModel = ''">
          Clear search
        </button>
      </div>
    </nav>

  </div>
</template>

<style scoped>
.docs-side-nav :deep(mark) {
  background: color-mix(in srgb, var(--color-beacon) 22%, transparent);
  color: var(--color-beacon);
  border-radius: 2px;
  padding: 0 1px;
}
</style>
