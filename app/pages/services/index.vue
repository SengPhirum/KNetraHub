<script setup lang="ts">
type ServiceViewMode = 'cards' | 'list'

const { relative, bytes, cpus } = useFormat()
const { can } = useAuth()
const { prefs } = usePreferences()
const toast = useToast()

const viewMode = useLocalStorage<ServiceViewMode>('dockhub:services:view', 'cards')
const viewOptions: Array<{ value: ServiceViewMode; icon: string; label: string }> = [
  { value: 'cards', icon: 'i-lucide-layout-grid', label: 'Card' },
  { value: 'list', icon: 'i-lucide-list', label: 'List' }
]

const { data, status, error, refreshing, refresh } = useApiCache('services', () => $fetch<any[]>('/api/services'))
onMounted(refresh)

const serviceRows = computed(() => data.value || [])
const serviceSortOptions = [
  { label: 'Name', value: 'name' },
  { label: 'Stack', value: 'stack' },
  { label: 'Image', value: 'image' },
  { label: 'Mode', value: 'mode' },
  { label: 'Status', value: 'status' },
  { label: 'Running', value: 'running' },
  { label: 'Replicas', value: 'replicas' },
  { label: 'Updated', value: 'updatedAt' }
]
const serviceFilterOptions = [
  { key: 'status', label: 'Status', getValue: (s: any) => s.status },
  { key: 'mode', label: 'Mode', getValue: (s: any) => s.mode }
]
const { items: filtered, search, sortBy, sortDir, sortOptions, filters, facets } = useListControls('services', serviceRows, {
  sortOptions: serviceSortOptions,
  defaultSortBy: 'updatedAt',
  filterOptions: serviceFilterOptions
})

const { connected } = useDockerEvents((evt) => {
  if (['service', 'task', 'container'].includes(evt.type)) refresh()
})

useIntervalFn(() => {
  if (!connected.value && prefs.value.refreshInterval > 0) refresh()
}, computed(() => prefs.value.refreshInterval > 0 ? prefs.value.refreshInterval * 1000 : 60_000), { immediate: false })

// Live ring fills - separate from the heavier /api/services listing above,
// polled on its own short interval so rings animate in near-real-time
// regardless of Docker events (CPU/memory drift continuously on their own).
const usageData = ref<{ services: any[] } | null>(null)
const usageById = computed(() => new Map((usageData.value?.services || []).map((u: any) => [u.id, u])))
async function refreshUsage() {
  try {
    usageData.value = await $fetch('/api/services/usage')
  } catch {
    // keep the last good sample on screen
  }
}
onMounted(refreshUsage)
useIntervalFn(refreshUsage, 5000, { immediate: false })

function clampPercent(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}
function ringStyle(percent?: number | null) {
  const safe = clampPercent(percent)
  return {
    background: `conic-gradient(var(--color-running) ${safe}%, color-mix(in srgb, var(--color-hull) 82%, transparent) 0)`
  }
}
function memoryPercent(used?: number | null, limit?: number | null) {
  if (!used || !limit) return null
  return Math.min(100, (used / limit) * 100)
}
function replicaPercent(svc: any) {
  const desired = Number(svc.desired || svc.replicas || 0)
  const running = Number(svc.running || 0)
  if (desired <= 0) return running > 0 ? 100 : 0
  return (running / desired) * 100
}
function cpuRingPercent(svc: any) {
  const usage = usageById.value.get(svc.id)
  if (!usage?.available) return 0
  const allocated = resourceNanoCpus(svc) / 1e9
  if (allocated > 0) return (Number(usage.cpuPercent || 0) / (allocated * 100)) * 100
  return Number(usage.cpuPercent || 0)
}
function memoryRingPercent(svc: any) {
  const usage = usageById.value.get(svc.id)
  if (!usage?.available) return 0
  return memoryPercent(usage.memoryUsedBytes, usage.memoryLimitBytes || resourceMemory(svc)) ?? 0
}

const scaleTarget = ref<any>(null)
const scaleValue = ref(1)
function openScale(svc: any) {
  scaleTarget.value = svc
  scaleValue.value = svc.replicas ?? 1
}
async function doScale() {
  try {
    await $fetch(`/api/services/${scaleTarget.value.id}/scale`, { method: 'POST', body: { replicas: Number(scaleValue.value) } })
    toast.add({ title: `Scaled ${scaleTarget.value.name} to ${scaleValue.value}`, color: 'primary', icon: 'i-lucide-scaling' })
    scaleTarget.value = null
    refresh()
  } catch (e: any) {
    toast.add({ title: 'Scale failed', description: e?.data?.statusMessage, color: 'error' })
  }
}

async function redeploy(svc: any) {
  try {
    await $fetch(`/api/services/${svc.id}/redeploy`, { method: 'POST' })
    toast.add({ title: `Redeploying ${svc.name}`, color: 'primary', icon: 'i-lucide-refresh-cw' })
    refresh()
  } catch (e: any) {
    toast.add({ title: 'Redeploy failed', description: e?.data?.statusMessage, color: 'error' })
  }
}

async function remove(svc: any) {
  if (!confirm(`Remove service "${svc.name}"? This stops all its tasks.`)) return
  const saved = [...(data.value ?? [])]
  data.value = saved.filter((s) => s.id !== svc.id)
  try {
    await $fetch(`/api/services/${svc.id}`, { method: 'DELETE' })
    toast.add({ title: `Removed ${svc.name}`, color: 'primary' })
  } catch (e: any) {
    data.value = saved
    toast.add({ title: 'Remove failed', description: e?.data?.statusMessage, color: 'error' })
  }
}

function menu(svc: any) {
  const items: any[] = [[{ label: 'Inspect', icon: 'i-lucide-eye', to: `/services/${svc.id}` }]]
  if (can('operator')) {
    items.push([
      ...(svc.mode === 'replicated' ? [{ label: 'Scale', icon: 'i-lucide-scaling', onSelect: () => openScale(svc) }] : []),
      { label: 'Redeploy', icon: 'i-lucide-refresh-cw', onSelect: () => redeploy(svc) }
    ])
    items.push([{ label: 'Remove', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => remove(svc) }])
  }
  return items
}

function statusDotClass(status: string) {
  if (status === 'running') return 'dot-running'
  if (status === 'pending' || status === 'updating') return 'dot-pending'
  if (status === 'idle') return 'dot-idle'
  return 'dot-down'
}

function replicaLabel(svc: any) {
  return svc.mode === 'global'
    ? `${svc.running ?? 0}/global`
    : `${svc.running ?? 0}/${svc.replicas ?? 0}`
}

function desiredLabel(svc: any) {
  return svc.mode === 'global' ? 'global' : `${svc.desired ?? svc.replicas ?? 0} desired`
}

function portsLabel(ports: any[] = []) {
  if (!ports.length) return '-'
  return ports.map((p) => {
    const proto = p.protocol && p.protocol !== 'tcp' ? `/${p.protocol}` : ''
    return p.published ? `${p.published}:${p.target}${proto}` : `${p.target}${proto}`
  }).join(', ')
}

function resourceNanoCpus(svc: any) {
  return svc.resources?.reservedNanoCpusTotal || svc.resources?.limitNanoCpusTotal || 0
}

function resourceMemory(svc: any) {
  return svc.resources?.reservedMemoryBytesTotal || svc.resources?.limitMemoryBytesTotal || 0
}

function resourceHint(svc: any) {
  if (svc.resources?.reservedNanoCpusTotal || svc.resources?.reservedMemoryBytesTotal) return 'reserved'
  if (svc.resources?.limitNanoCpusTotal || svc.resources?.limitMemoryBytesTotal) return 'limit'
  return 'not set'
}

function cpuValue(svc: any) {
  const value = resourceNanoCpus(svc)
  return value ? cpus(value / 1e9) : '-'
}

function memoryValue(svc: any) {
  const value = resourceMemory(svc)
  return value ? bytes(value) : '-'
}
</script>

<template>
  <div>
    <PageHeader title="Services" subtitle="Replicated and global workloads across the swarm" icon="i-lucide-boxes">
      <template #actions>
        <ListControls
          inline
          v-model:search="search"
          v-model:sort-by="sortBy"
          v-model:sort-dir="sortDir"
          v-model:filters="filters"
          :sort-options="sortOptions"
          :facets="facets"
          placeholder="Search services"
        />
        <div class="flex rounded-md border border-hull bg-surface p-0.5" aria-label="Service view">
          <button
            v-for="opt in viewOptions"
            :key="opt.value"
            type="button"
            class="flex size-8 items-center justify-center rounded text-(--color-muted) transition hover:text-foam"
            :class="viewMode === opt.value ? 'bg-beacon/15 text-beacon ring-1 ring-inset ring-beacon/25' : ''"
            :title="opt.label"
            :aria-label="`${opt.label} view`"
            :aria-pressed="viewMode === opt.value"
            @click="viewMode = opt.value"
          >
            <UIcon :name="opt.icon" class="size-4" />
          </button>
        </div>
        <div class="flex items-center gap-1.5 text-xs text-faint select-none">
          <span class="dot" :class="connected ? 'dot-running' : 'dot-idle'" />
          {{ connected ? 'Live' : prefs.refreshInterval > 0 ? `${prefs.refreshInterval}s` : 'Manual' }}
        </div>
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" :loading="refreshing" @click="refresh()" />
      </template>
    </PageHeader>

    <DataState :status="status" :error="error" :empty="filtered.length === 0" :refreshing="refreshing" empty-label="No services running." empty-icon="i-lucide-boxes">
      <TransitionGroup v-if="viewMode === 'cards'" name="list" tag="div" class="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        <article
          v-for="svc in filtered"
          :key="svc.id"
          class="panel-flush rounded-lg p-4 transition hover:ring-1 hover:ring-beacon/30"
        >
          <div class="flex items-start justify-between gap-3">
            <NuxtLink :to="`/services/${svc.id}`" class="group flex min-w-0 items-start gap-3">
              <span class="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-2 ring-1 ring-hull">
                <span class="dot" :class="statusDotClass(svc.status)" />
              </span>
              <span class="min-w-0">
                <span class="block truncate font-display text-base font-semibold text-foam group-hover:text-beacon">{{ svc.name || '-' }}</span>
                <span class="mt-0.5 block truncate font-mono text-xs text-faint">{{ svc.image || '-' }}</span>
              </span>
            </NuxtLink>
            <UDropdownMenu :items="menu(svc)" :content="{ align: 'end' }">
              <UButton icon="i-lucide-ellipsis-vertical" color="neutral" variant="ghost" size="sm" aria-label="Actions" />
            </UDropdownMenu>
          </div>

          <div class="mt-3 flex flex-wrap gap-1.5">
            <StatusBadge :state="svc.status" />
            <span class="rounded px-2 py-1 text-[11px] font-semibold uppercase leading-none text-(--color-muted) ring-1 ring-hull">
              {{ svc.mode }}
            </span>
            <NuxtLink v-if="svc.stack" :to="`/stacks/${svc.stack}`" class="rounded px-2 py-1 text-[11px] font-semibold uppercase leading-none text-beacon ring-1 ring-beacon/25">
              {{ svc.stack }}
            </NuxtLink>
          </div>

          <div class="mt-4 grid grid-cols-3 gap-3 text-center">
            <div>
              <div class="summary-ring mx-auto size-20" :style="ringStyle(replicaPercent(svc))">
                <div class="summary-ring-inner">
                  <p class="font-mono text-sm font-semibold text-foam">{{ replicaLabel(svc) }}</p>
                  <p class="text-[10px] leading-tight text-faint">replica</p>
                </div>
              </div>
            </div>
            <div>
              <div class="summary-ring mx-auto size-20" :style="ringStyle(cpuRingPercent(svc))">
                <div class="summary-ring-inner">
                  <p class="font-mono text-xs font-semibold text-foam">{{ cpuValue(svc) }}</p>
                  <p class="text-[10px] leading-tight text-faint">vCPU</p>
                </div>
              </div>
            </div>
            <div>
              <div class="summary-ring mx-auto size-20" :style="ringStyle(memoryRingPercent(svc))">
                <div class="summary-ring-inner">
                  <p class="font-mono text-xs font-semibold text-foam">{{ memoryValue(svc) }}</p>
                  <p class="text-[10px] leading-tight text-faint">RAM</p>
                </div>
              </div>
            </div>
          </div>

          <dl class="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-hull-soft pt-3 text-xs">
            <div>
              <dt class="text-faint">Desired</dt>
              <dd class="mt-0.5 truncate font-mono text-(--color-muted)">{{ desiredLabel(svc) }}</dd>
            </div>
            <div>
              <dt class="text-faint">Resources</dt>
              <dd class="mt-0.5 truncate font-mono text-(--color-muted)">{{ resourceHint(svc) }}</dd>
            </div>
            <div>
              <dt class="text-faint">Ports</dt>
              <dd class="mt-0.5 truncate font-mono text-(--color-muted)" :title="portsLabel(svc.ports)">{{ portsLabel(svc.ports) }}</dd>
            </div>
            <div>
              <dt class="text-faint">Updated</dt>
              <dd class="mt-0.5 truncate text-(--color-muted)">{{ relative(svc.updatedAt) }}</dd>
            </div>
          </dl>
        </article>
      </TransitionGroup>

      <div v-else class="space-y-2">
        <div class="hidden rounded-md px-3.5 text-[11px] font-semibold uppercase tracking-wide text-faint xl:grid xl:grid-cols-[minmax(14rem,1.25fr)_minmax(8rem,0.8fr)_minmax(9rem,0.8fr)_minmax(11rem,1fr)_minmax(10rem,0.9fr)_auto] xl:items-center xl:gap-4">
          <span>Service</span>
          <span>Stack</span>
          <span>Replicas</span>
          <span>Ports</span>
          <span>Status</span>
          <span class="text-right">Actions</span>
        </div>
        <TransitionGroup name="list" tag="div" class="space-y-2">
          <div
            v-for="svc in filtered"
            :key="svc.id"
            class="panel-flush grid gap-3 rounded-lg p-3.5 transition hover:ring-1 hover:ring-beacon/30 sm:grid-cols-2 xl:grid-cols-[minmax(14rem,1.25fr)_minmax(8rem,0.8fr)_minmax(9rem,0.8fr)_minmax(11rem,1fr)_minmax(10rem,0.9fr)_auto] xl:items-center xl:gap-4"
          >
            <div class="min-w-0 sm:col-span-2 xl:col-span-1">
              <NuxtLink :to="`/services/${svc.id}`" class="group flex items-center gap-2">
                <span class="dot" :class="statusDotClass(svc.status)" />
                <span class="truncate font-medium text-foam group-hover:text-beacon">{{ svc.name || '-' }}</span>
              </NuxtLink>
              <p class="mt-1 truncate pl-4 font-mono text-xs text-faint">{{ svc.image || '-' }}</p>
            </div>
            <div class="min-w-0">
              <NuxtLink v-if="svc.stack" :to="`/stacks/${svc.stack}`" class="inline-flex max-w-full items-center gap-1 rounded bg-surface-2 px-2 py-0.5 text-xs text-(--color-muted) hover:text-foam">
                <UIcon name="i-lucide-layers" class="size-3 shrink-0" />
                <span class="truncate">{{ svc.stack }}</span>
              </NuxtLink>
              <span v-else class="text-xs text-faint">-</span>
            </div>
            <div>
              <p class="font-mono text-sm text-foam">{{ replicaLabel(svc) }}</p>
              <p class="text-xs text-faint capitalize">{{ svc.mode || '-' }}</p>
            </div>
            <div class="min-w-0 font-mono text-xs text-(--color-muted)" :title="portsLabel(svc.ports)">
              <span class="block truncate">{{ portsLabel(svc.ports) }}</span>
            </div>
            <div class="flex items-center justify-between gap-2 xl:justify-start">
              <StatusBadge :state="svc.status" />
              <span class="text-xs text-faint xl:hidden">{{ relative(svc.updatedAt) }}</span>
            </div>
            <div class="flex justify-end sm:col-span-2 xl:col-span-1">
              <UDropdownMenu :items="menu(svc)" :content="{ align: 'end' }">
                <UButton icon="i-lucide-ellipsis-vertical" color="neutral" variant="ghost" size="sm" aria-label="Actions" />
              </UDropdownMenu>
            </div>
          </div>
        </TransitionGroup>
      </div>
    </DataState>

    <UModal :open="!!scaleTarget" @update:open="scaleTarget = null" title="Scale service">
      <template #body>
        <p class="text-sm text-(--color-muted) mb-4">
          Set the replica count for <span class="font-mono text-foam">{{ scaleTarget?.name }}</span>.
        </p>
        <UInput v-model="scaleValue" type="number" min="0" size="lg" class="w-full" icon="i-lucide-scaling" />
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" label="Cancel" @click="scaleTarget = null" />
          <UButton color="primary" label="Apply" icon="i-lucide-check" @click="doScale" />
        </div>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
.summary-ring {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  padding: 0.5rem;
  transition: background 0.5s ease;
}

.summary-ring-inner {
  display: flex;
  width: 100%;
  height: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: inherit;
  background: var(--color-surface);
  padding: 0.25rem;
}
</style>
