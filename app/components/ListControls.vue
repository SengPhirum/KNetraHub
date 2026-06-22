<script setup lang="ts">
import type { ListFilterFacet, ListSortOption, SortDirection } from '~/composables/useListControls'

const props = withDefaults(defineProps<{
  search: string
  sortBy: string
  sortDir: SortDirection
  sortOptions: Array<ListSortOption>
  placeholder?: string
  facets?: ListFilterFacet[]
  filters?: Record<string, string[]>
  /** Renders as bare flex items with no margin/wrapper box of its own, so
   * it can sit directly inside another flex row (e.g. merged into
   * PageHeader's actions row) instead of stacking below it as its own
   * full-width row. The expanded filter panel still drops to its own
   * full-width line (via order-last) when toggled open. */
  inline?: boolean
}>(), {
  placeholder: 'Search',
  facets: () => [],
  filters: () => ({}),
  inline: false
})

const emit = defineEmits<{
  'update:search': [value: string]
  'update:sortBy': [value: string]
  'update:sortDir': [value: SortDirection]
  'update:filters': [value: Record<string, string[]>]
}>()

const searchModel = computed({
  get: () => props.search,
  set: (value: string) => emit('update:search', value || '')
})
const sortModel = computed({
  get: () => props.sortBy,
  set: (value: string) => emit('update:sortBy', value)
})
const sortDirModel = computed({
  get: () => props.sortDir,
  set: (value: SortDirection) => emit('update:sortDir', value)
})
const selectItems = computed(() => props.sortOptions.map(({ label, value }) => ({ label, value })))

function toggleDirection() {
  sortDirModel.value = sortDirModel.value === 'asc' ? 'desc' : 'asc'
}

const showFilters = ref(false)
const activeFilterCount = computed(() => Object.values(props.filters || {}).filter((v) => v?.length).length)

function facetItems(facet: ListFilterFacet) {
  return facet.options.map((o) => ({ label: `${o.label} (${o.count})`, value: o.value }))
}
function facetModel(key: string) {
  return computed({
    get: () => props.filters?.[key] || [],
    set: (value: string[]) => emit('update:filters', { ...props.filters, [key]: value })
  })
}
function clearFilters() {
  emit('update:filters', {})
}

const groupClass = computed(() => {
  if (props.inline) return 'flex flex-wrap items-center gap-2'
  return props.facets.length
    ? 'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 sm:flex sm:w-auto'
    : 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:w-auto'
})
</script>

<template>
  <div :class="inline ? 'contents' : 'mb-4 space-y-2.5'">
    <div :class="inline ? 'contents' : 'flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'">
      <UInput
        v-model="searchModel"
        icon="i-lucide-search"
        :placeholder="placeholder"
        :class="inline ? 'w-full sm:w-48 lg:w-64' : 'w-full sm:max-w-xs'"
      />
      <div :class="groupClass">
        <UButton
          v-if="facets.length"
          color="neutral"
          :variant="showFilters || activeFilterCount ? 'soft' : 'ghost'"
          icon="i-lucide-list-filter"
          :label="activeFilterCount ? `Filters (${activeFilterCount})` : 'Filters'"
          :aria-pressed="showFilters"
          @click="showFilters = !showFilters"
        />
        <USelect
          v-model="sortModel"
          :items="selectItems"
          value-key="value"
          label-key="label"
          icon="i-lucide-arrow-up-down"
          aria-label="Sort by"
          class="min-w-0 sm:w-44"
        />
        <UButton
          color="neutral"
          variant="soft"
          :icon="sortDirModel === 'asc' ? 'i-lucide-arrow-up-a-z' : 'i-lucide-arrow-down-z-a'"
          :title="sortDirModel === 'asc' ? 'Ascending' : 'Descending'"
          :aria-label="sortDirModel === 'asc' ? 'Sort ascending' : 'Sort descending'"
          @click="toggleDirection"
        />
      </div>
    </div>

    <div
      v-if="showFilters && facets.length"
      class="flex w-full flex-wrap items-center gap-2 rounded-lg bg-surface-2/60 p-2.5 ring-1 ring-hull-soft"
      :class="inline ? 'order-last' : ''"
    >
      <USelectMenu
        v-for="facet in facets"
        :key="facet.key"
        :model-value="facetModel(facet.key).value"
        @update:model-value="facetModel(facet.key).value = $event"
        :items="facetItems(facet)"
        value-key="value"
        label-key="label"
        multiple
        :placeholder="facet.label"
        class="w-48"
      />
      <UButton v-if="activeFilterCount" color="neutral" variant="ghost" size="xs" icon="i-lucide-x" label="Clear filters" @click="clearFilters" />
    </div>
  </div>
</template>
