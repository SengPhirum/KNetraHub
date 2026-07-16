<script setup lang="ts">
// Generic paginated list page for the read-only Monitoring resource views.
// Columns are described declaratively; a `device`-typed column links to the
// device detail page.
interface Column {
  key: string
  label: string
  align?: 'left' | 'right'
  type?: 'text' | 'device' | 'status' | 'bits' | 'bytes' | 'percent' | 'datetime' | 'badge'
  format?: (row: any) => string
}
const props = defineProps<{
  title: string
  subtitle?: string
  icon: string
  endpoint: string
  columns: Column[]
}>()

const { hasMonitoring, deviceStatusMeta, formatBits, formatBytes } = useMonitoring()
const page = ref(1)
const url = computed(() => `${props.endpoint}${props.endpoint.includes('?') ? '&' : '?'}page=${page.value}&per_page=50`)
const { data, status } = useAsyncData(`monList:${props.endpoint}`,
  () => $fetch<any>(url.value),
  { server: false, default: () => ({ items: [], total: 0 }), watch: [url] })

const totalPages = computed(() => Math.max(1, Math.ceil((data.value?.total ?? data.value?.items?.length ?? 0) / 50)))

function cell(row: any, col: Column): string {
  if (col.format) return col.format(row)
  const v = row[col.key]
  if (v == null) return '—'
  switch (col.type) {
    case 'bits': return formatBits(v)
    case 'bytes': return formatBytes(v)
    case 'percent': return typeof v === 'number' ? v.toFixed(1) + '%' : String(v)
    case 'datetime': return new Date(v).toLocaleString()
    default: return String(v)
  }
}
</script>

<template>
  <div>
    <PageHeader :title="title" :subtitle="subtitle" :icon="icon" />
    <div v-if="!hasMonitoring" class="panel p-10 text-center text-muted">No access to the Monitoring app.</div>
    <div v-else class="space-y-4">
      <div class="flex items-center"><span class="ml-auto text-sm text-muted">{{ data?.total ?? data?.items?.length ?? 0 }} rows</span></div>
      <div class="panel overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-surface-2 text-left text-xs uppercase tracking-wide text-faint">
            <tr>
              <th v-for="col in columns" :key="col.key" class="px-3 py-2" :class="col.align === 'right' ? 'text-right' : ''">{{ col.label }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="status === 'pending'"><td :colspan="columns.length" class="px-3 py-8 text-center text-muted">Loading…</td></tr>
            <tr v-else-if="!data?.items?.length"><td :colspan="columns.length" class="px-3 py-8 text-center text-muted">No data.</td></tr>
            <tr v-for="(row, i) in data.items" :key="i" class="border-t border-hull hover:bg-surface-2/50">
              <td v-for="col in columns" :key="col.key" class="px-3 py-2" :class="col.align === 'right' ? 'text-right' : ''">
                <NuxtLink v-if="col.type === 'device' && row.device_id" :to="`/monitoring/devices/${row.device_id}`" class="text-primary hover:underline">
                  {{ cell(row, col) }}
                </NuxtLink>
                <span v-else-if="col.type === 'status'"
                  :class="['inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs', deviceStatusMeta(row[col.key]).badge]">
                  <span :class="['h-1.5 w-1.5 rounded-full', deviceStatusMeta(row[col.key]).dot]" />{{ cell(row, col) }}
                </span>
                <span v-else>{{ cell(row, col) }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="totalPages > 1" class="flex items-center justify-center gap-2">
        <UButton size="xs" :disabled="page <= 1" @click="page--">Prev</UButton>
        <span class="text-sm text-muted">{{ page }} / {{ totalPages }}</span>
        <UButton size="xs" :disabled="page >= totalPages" @click="page++">Next</UButton>
      </div>
    </div>
  </div>
</template>
