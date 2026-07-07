export type SortDirection = 'asc' | 'desc'

export interface ListSortOption<T = any> {
  label: string
  value: string
  getValue?: (item: T) => unknown
}

export interface ListFilterOption<T = any> {
  key: string
  label: string
  /** Returns the item's value(s) for this dimension. Distinct values found
   * across the (search-filtered) dataset become the selectable options. */
  getValue: (item: T) => string | number | null | undefined | Array<string | number>
}

export interface ListFilterFacetOption {
  label: string
  value: string
  count: number
}

export interface ListFilterFacet {
  key: string
  label: string
  options: ListFilterFacetOption[]
}

interface UseListControlsOptions<T> {
  sortOptions: Array<ListSortOption<T>>
  defaultSortBy?: string
  defaultSortDir?: SortDirection
  filterOptions?: Array<ListFilterOption<T>>
  /** Initial filter selection when the user has no saved preference yet for
   * this list key - e.g. a Tasks table embedded in a Node/Service detail
   * page can default to {state: ['running']} while the standalone Tasks
   * list page shows everything. */
  defaultFilters?: Record<string, string[]>
  /** Secondary sort key used only when the primary sort field compares
   * equal between two items, e.g. break ties on a task's created date so
   * otherwise-identical rows land in a meaningful order. */
  tieBreaker?: (item: T) => unknown
  /** Fixed direction for the tie-breaker, independent of the user's chosen
   * sortDir - e.g. always newest-created-first. Defaults to following
   * sortDir (the tie-breaker flips along with the primary sort). */
  tieBreakerDir?: SortDirection
}

function resolveListSource<T>(source: any): T[] {
  const value = typeof source === 'function' ? source() : source?.value
  return Array.isArray(value) ? value : []
}

function pathValue(item: any, path: string): unknown {
  return path.split('.').reduce((current, segment) => current?.[segment], item)
}

function searchableText(value: unknown, seen = new WeakSet<object>()): string {
  if (value == null) return ''
  if (value instanceof Date) return value.toISOString()
  if (['string', 'number', 'boolean', 'bigint'].includes(typeof value)) return String(value)
  if (Array.isArray(value)) return value.map((item) => searchableText(item, seen)).join(' ')
  if (typeof value === 'object') {
    if (seen.has(value)) return ''
    seen.add(value)
    return Object.values(value).map((item) => searchableText(item, seen)).join(' ')
  }
  return ''
}

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1

  const aValue = a instanceof Date ? a.getTime() : a
  const bValue = b instanceof Date ? b.getTime() : b
  if (typeof aValue === 'number' && typeof bValue === 'number') return aValue - bValue
  if (typeof aValue === 'boolean' && typeof bValue === 'boolean') return Number(aValue) - Number(bValue)

  return String(aValue).localeCompare(String(bValue), undefined, { numeric: true, sensitivity: 'base' })
}

function normalizeFilterValues(value: ReturnType<ListFilterOption['getValue']>): string[] {
  if (value == null) return []
  const arr = Array.isArray(value) ? value : [value]
  return arr.map((v) => String(v))
}

export function useListControls<T = any>(
  key: string,
  source: any,
  options: UseListControlsOptions<T>
) {
  const { prefs, updatePreferences } = usePreferences()
  const sortOptions = options.sortOptions
  const filterOptions = options.filterOptions || []
  const fallbackSort = options.defaultSortBy || sortOptions[0]?.value || ''
  const fallbackDir = options.defaultSortDir || 'asc'
  const preferred = computed(() => prefs.value.lists?.[key])

  const search = ref('')
  const sortBy = ref(preferred.value?.sortBy || fallbackSort)
  const sortDir = ref<SortDirection>(preferred.value?.sortDir || fallbackDir)
  const filters = ref<Record<string, string[]>>({ ...(preferred.value?.filters || options.defaultFilters || {}) })
  const restoringPreference = ref(false)
  let persistTimer: ReturnType<typeof setTimeout> | null = null

  watch(preferred, (next) => {
    restoringPreference.value = true
    if (next && sortOptions.some((option) => option.value === next.sortBy)) {
      sortBy.value = next.sortBy
      sortDir.value = next.sortDir === 'desc' ? 'desc' : 'asc'
    }
    filters.value = { ...(next?.filters || options.defaultFilters || {}) }
    nextTick(() => { restoringPreference.value = false })
  }, { immediate: true })

  watch([sortBy, sortDir, filters], () => {
    if (restoringPreference.value) return
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      updatePreferences({
        lists: {
          ...(prefs.value.lists || {}),
          [key]: { sortBy: sortBy.value, sortDir: sortDir.value, filters: filters.value }
        }
      }).catch(() => null)
    }, 350)
  }, { deep: true })

  const searched = computed<T[]>(() => {
    const query = search.value.trim().toLowerCase()
    return resolveListSource<T>(source).filter((item) => {
      if (!query) return true
      return searchableText(item).toLowerCase().includes(query)
    })
  })

  // Facets are derived from the searched (but not yet filtered) dataset, so
  // switching one filter doesn't make other filters' options disappear.
  const facets = computed<ListFilterFacet[]>(() => {
    return filterOptions.map((def) => {
      const counts = new Map<string, number>()
      for (const item of searched.value) {
        for (const v of normalizeFilterValues(def.getValue(item))) {
          counts.set(v, (counts.get(v) || 0) + 1)
        }
      }
      const optionList = Array.from(counts.entries())
        .map(([value, count]) => ({ label: value, value, count }))
        .sort((a, b) => a.label.localeCompare(b.label))
      return { key: def.key, label: def.label, options: optionList }
    })
  })

  const activeFilterCount = computed(() => Object.values(filters.value).filter((v) => v?.length).length)

  function clearFilters() {
    filters.value = {}
  }

  const items = computed<T[]>(() => {
    const currentSort = sortOptions.find((option) => option.value === sortBy.value) || sortOptions[0]

    const filtered = searched.value.filter((item) => {
      for (const def of filterOptions) {
        const selected = filters.value[def.key]
        if (!selected?.length) continue
        const values = normalizeFilterValues(def.getValue(item))
        if (!values.some((v) => selected.includes(v))) return false
      }
      return true
    })

    if (!currentSort) return filtered

    // Array.prototype.sort is spec-guaranteed stable, so ties already keep
    // their original relative order for free - no manual index fallback
    // needed. When a tieBreaker is configured (e.g. a task's created date),
    // it's chained in as the real secondary sort key instead.
    return [...filtered].sort((a, b) => {
      const aValue = currentSort.getValue ? currentSort.getValue(a) : pathValue(a, currentSort.value)
      const bValue = currentSort.getValue ? currentSort.getValue(b) : pathValue(b, currentSort.value)
      const primary = compareValues(aValue, bValue)
      if (primary) return sortDir.value === 'desc' ? -primary : primary

      if (!options.tieBreaker) return 0
      const secondary = compareValues(options.tieBreaker(a), options.tieBreaker(b))
      const dir = options.tieBreakerDir || sortDir.value
      return dir === 'desc' ? -secondary : secondary
    })
  })

  function toggleSortDir() {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  }

  return { items, search, sortBy, sortDir, sortOptions, toggleSortDir, filters, facets, activeFilterCount, clearFilters }
}
