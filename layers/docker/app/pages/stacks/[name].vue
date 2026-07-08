<script setup lang="ts">
const route = useRoute()
const name = route.params.name as string
const { can } = useAuth()
const { bytes, cpus, relative, short } = useFormat()
const { prefs } = usePreferences()
const toast = useToast()

const { data, status, error, refreshing, refresh } = useApiCache(`stack:${name}`, () => $fetch<any>(`/api/stacks/${name}`))
onMounted(refresh)

const { connected } = useDockerEvents((evt) => {
  if (['service', 'task', 'network', 'volume', 'secret', 'config'].includes(evt.type)) refresh()
})
useIntervalFn(() => {
  if (prefs.value.refreshInterval > 0) refresh()
}, computed(() => prefs.value.refreshInterval > 0 ? prefs.value.refreshInterval * 1000 : 60_000), { immediate: false })

const tab = ref<'overview' | 'services' | 'compose' | 'history'>('overview')
const summary = computed(() => data.value?.summary || {})
const currentUsage = computed(() => summary.value.currentUsage || { available: false, containers: 0, cpuPercent: 0, memoryUsedBytes: 0, memoryLimitBytes: 0, sampledAt: null })
const serviceRows = computed(() => data.value?.services || [])
const networkRows = computed(() => data.value?.networks || [])
const volumeRows = computed(() => data.value?.volumes || [])
const secretRows = computed(() => data.value?.secrets || [])
const configRows = computed(() => data.value?.configs || [])
const historyRows = computed(() => data.value?.history || [])

const serviceSortOptions = [
  { label: 'Name', value: 'name' },
  { label: 'Image', value: 'image' },
  { label: 'Running', value: 'running' },
  { label: 'Replicas', value: 'replicas' },
  { label: 'Status', value: 'status' }
]
const {
  items: filteredServices,
  search: serviceSearch,
  sortBy: serviceSortBy,
  sortDir: serviceSortDir,
  sortOptions: serviceSortOptionsState
} = useListControls(`stack:${name}:services`, serviceRows, {
  sortOptions: serviceSortOptions,
  defaultSortBy: 'name'
})
const historySortOptions = [
  { label: 'Date', value: 'created_at' },
  { label: 'Author', value: 'author_name' },
  { label: 'Title', value: 'title' },
  { label: 'Commit', value: 'id' }
]
const {
  items: filteredHistory,
  search: historySearch,
  sortBy: historySortBy,
  sortDir: historySortDir,
  sortOptions: historySortOptionsState
} = useListControls(`stack:${name}:history`, historyRows, {
  sortOptions: historySortOptions,
  defaultSortBy: 'created_at',
  defaultSortDir: 'desc'
})

const draft = ref('')
const editMessage = ref('')
const editOpen = ref(false)
const saving = ref(false)
watch(data, (d) => {
  if (d?.compose != null && !editOpen.value) draft.value = d.compose
}, { immediate: true })

const composeSourceLabel = computed(() => {
  if (data.value?.composeSource === 'gitlab') return 'GitLab desired state'
  if (data.value?.composeSource === 'engine') return 'Current engine state'
  return 'No compose source'
})
const composeSourceTone = computed(() => data.value?.composeSource === 'gitlab' ? 'primary' : data.value?.composeSource === 'engine' ? 'warning' : 'neutral')
const resourceCpuNano = computed(() => summary.value.reservedNanoCpus || summary.value.limitNanoCpus || 0)
const resourceMemoryBytes = computed(() => summary.value.reservedMemoryBytes || summary.value.limitMemoryBytes || 0)
const resourceHint = computed(() => {
  if (summary.value.reservedNanoCpus || summary.value.reservedMemoryBytes) return 'reserved'
  if (summary.value.limitNanoCpus || summary.value.limitMemoryBytes) return 'limit'
  return 'not set'
})
const tabs = computed(() => {
  const t: any[] = [{ key: 'overview', label: 'Overview', icon: 'i-lucide-layout-dashboard' }]
  t.push({ key: 'services', label: 'Services', icon: 'i-lucide-boxes' })
  if (data.value?.compose != null) t.push({ key: 'compose', label: 'Compose', icon: 'i-lucide-file-code' })
  if (data.value?.history?.length) t.push({ key: 'history', label: 'History', icon: 'i-lucide-history' })
  return t
})

function formatNanoCpus(value?: number | null) {
  return value ? cpus(value / 1e9) : '-'
}

function formatBytes(value?: number | null) {
  return value ? bytes(value) : '-'
}

function memoryPercent(used?: number | null, limit?: number | null) {
  if (!used || !limit) return null
  return Math.min(100, (used / limit) * 100)
}

function percentLabel(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return '-'
  return `${value.toFixed(value < 10 ? 1 : 0)}%`
}

const { usageRingStyle } = useUsageRing()

function cpuRingPercent() {
  if (!currentUsage.value.available) return 0
  const allocated = resourceCpuNano.value / 1e9
  if (allocated > 0) return (Number(currentUsage.value.cpuPercent || 0) / (allocated * 100)) * 100
  return Number(currentUsage.value.cpuPercent || 0)
}

function memoryRingPercent() {
  if (!currentUsage.value.available) return 0
  return memoryPercent(currentUsage.value.memoryUsedBytes, currentUsage.value.memoryLimitBytes || resourceMemoryBytes.value) ?? 0
}

function cpuDetail() {
  const allocated = resourceCpuNano.value ? `${formatNanoCpus(resourceCpuNano.value)} ${resourceHint.value}` : 'No CPU reservation or limit'
  if (!currentUsage.value.available) return `${allocated}. Waiting for current usage samples.`
  return `${percentLabel(currentUsage.value.cpuPercent)} CPU now (${cpus(Number(currentUsage.value.cpuPercent || 0) / 100)}), ${allocated}.`
}

function memoryDetail() {
  const allocated = resourceMemoryBytes.value ? `${formatBytes(resourceMemoryBytes.value)} ${resourceHint.value}` : 'No memory reservation or limit'
  if (!currentUsage.value.available) return `${allocated}. Waiting for current usage samples.`
  return `${formatBytes(currentUsage.value.memoryUsedBytes)} used / ${formatBytes(currentUsage.value.memoryLimitBytes || resourceMemoryBytes.value)} (${percentLabel(memoryRingPercent())}), ${allocated}.`
}

function replicaLabel(service: any) {
  return service.replicas == null ? `${service.running ?? 0}/global` : `${service.running ?? 0}/${service.replicas ?? 0}`
}

function portsLabel(ports: any[] = []) {
  if (!ports.length) return '-'
  return ports.map((p) => {
    const proto = p.protocol && p.protocol !== 'tcp' ? `/${p.protocol}` : ''
    return p.published ? `${p.published}:${p.target}${proto}` : `${p.target}${proto}`
  }).join(', ')
}

function listLabel(items: string[] = []) {
  return items.length ? items.join(', ') : '-'
}

function openEdit() {
  if (!data.value?.compose) {
    toast.add({ title: 'No compose source available', color: 'warning' })
    return
  }
  draft.value = data.value.compose
  editMessage.value = `Update ${name} via KNetraHub`
  editOpen.value = true
}

function cancelEdit() {
  editOpen.value = false
  draft.value = data.value?.compose || ''
}

async function redeploy() {
  if (!draft.value) { toast.add({ title: 'No compose content', color: 'warning' }); return }
  saving.value = true
  try {
    const res: any = await $fetch('/api/stacks', {
      method: 'POST',
      body: { name, compose: draft.value, message: editMessage.value || `Update ${name} via KNetraHub` }
    })
    toast.add({ title: `Redeployed ${name}`, description: `${res.created?.length || 0} created, ${res.updated?.length || 0} updated`, color: 'primary', icon: 'i-lucide-rocket' })
    if (res.warnings?.length) toast.add({ title: 'Warnings', description: res.warnings.slice(0, 3).join('; '), color: 'warning' })
    editOpen.value = false
    tab.value = 'overview'
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Deploy failed', description: e?.data?.statusMessage || e?.message, color: 'error' })
  } finally {
    saving.value = false
  }
}

const diffOpen = ref(false)
const diffSha = ref('')
const diffContent = ref('')
const diffLoading = ref(false)
async function viewCommit(sha: string) {
  diffSha.value = sha
  diffOpen.value = true
  diffLoading.value = true
  diffContent.value = ''
  try {
    const res: any = await $fetch(`/api/gitlab/${name}/commit`, { query: { sha } })
    diffContent.value = res.compose || res.content || ''
  } catch (e: any) {
    diffContent.value = `# Failed to load: ${e?.data?.statusMessage || e?.message}`
  } finally {
    diffLoading.value = false
  }
}
async function rollback(sha: string) {
  if (!confirm(`Roll back "${name}" to commit ${sha.slice(0, 8)}? This commits and redeploys the older version.`)) return
  try {
    await $fetch(`/api/stacks/${name}/rollback`, { method: 'POST', body: { sha } })
    toast.add({ title: `Rolled back ${name}`, description: `to ${sha.slice(0, 8)}`, color: 'primary', icon: 'i-lucide-history' })
    diffOpen.value = false
    refresh()
  } catch (e: any) {
    toast.add({ title: 'Rollback failed', description: e?.data?.statusMessage || e?.message, color: 'error' })
  }
}
async function remove() {
  if (!confirm(`Remove stack "${name}"? This stops and deletes all its services.`)) return
  try {
    await $fetch(`/api/stacks/${name}`, { method: 'DELETE' })
    toast.add({ title: `Removed ${name}`, color: 'primary' })
    navigateTo('/stacks')
  } catch (e: any) {
    toast.add({ title: 'Remove failed', description: e?.data?.statusMessage || e?.message, color: 'error' })
  }
}
async function deleteFromGitlab() {
  if (!confirm(`Permanently delete "${name}" from GitLab?\n\nThis removes its compose file and commit history from version control. It is not currently deployed, so nothing will be stopped - but this cannot be undone and the stack will no longer appear in KNetraHub.`)) return
  try {
    await $fetch(`/api/stacks/${name}?git=true`, { method: 'DELETE' })
    toast.add({ title: `Deleted ${name} from GitLab`, color: 'primary' })
    navigateTo('/stacks')
  } catch (e: any) {
    toast.add({ title: 'Delete failed', description: e?.data?.statusMessage || e?.message, color: 'error' })
  }
}
</script>

<template>
  <div>
    <PageHeader :title="`Stack ${name}`" subtitle="Application stack" icon="i-lucide-layers">
      <template #actions>
        <div class="flex items-center gap-1.5 text-xs text-faint select-none">
          <span class="dot" :class="connected ? 'dot-running' : 'dot-idle'" />
          {{ connected ? 'Live' : prefs.refreshInterval > 0 ? `${prefs.refreshInterval}s` : 'Manual' }}
        </div>
        <UButton icon="i-lucide-arrow-left" color="neutral" variant="ghost" to="/stacks" label="Back" />
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" :loading="refreshing" @click="refresh()" />
        <UButton v-if="can('operator')" icon="i-lucide-pencil" color="primary" label="Edit" :disabled="!data?.compose" @click="openEdit" />
        <UButton v-if="can('operator') && summary.status === 'defined'" icon="i-lucide-trash-2" color="error" variant="soft" label="Delete from GitLab" @click="deleteFromGitlab" />
        <UButton v-else-if="can('operator')" icon="i-lucide-trash-2" color="error" variant="soft" label="Remove" @click="remove" />
      </template>
    </PageHeader>

    <DataState :status="status" :error="error" :refreshing="refreshing">
      <div class="flex flex-wrap gap-1 mb-5 border-b border-hull">
        <button v-for="t in tabs" :key="t.key" @click="tab = t.key"
          class="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition"
          :class="tab === t.key ? 'border-beacon text-foam' : 'border-transparent text-(--color-muted) hover:text-foam'">
          <UIcon :name="t.icon" class="size-4" /> {{ t.label }}
        </button>
      </div>

      <div v-if="tab === 'overview'" class="grid gap-4 xl:grid-cols-[minmax(300px,0.85fr)_minmax(0,1.65fr)]">
        <div class="space-y-4">
          <section class="panel p-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <StatusBadge :state="summary.status" />
              <UBadge :color="composeSourceTone" variant="subtle" :label="composeSourceLabel" />
            </div>

            <div class="mt-6 grid grid-cols-3 gap-3 text-center">
              <div class="min-w-0">
                <div class="mx-auto flex size-20 items-center justify-center rounded-full border-8 border-running/70 bg-running/10 sm:size-24">
                  <div>
                    <p class="font-mono text-lg font-semibold text-foam">{{ summary.services ?? 0 }}</p>
                    <p class="text-[11px] leading-tight text-faint">services</p>
                  </div>
                </div>
              </div>
              <div class="min-w-0">
                <div class="summary-ring-wrap" :title="cpuDetail()">
                  <div class="summary-ring mx-auto size-20 sm:size-24" :style="usageRingStyle(cpuRingPercent())" tabindex="0" :aria-label="cpuDetail()">
                    <div class="summary-ring-inner">
                      <p class="font-mono text-sm font-semibold text-foam">{{ formatNanoCpus(resourceCpuNano) }}</p>
                      <p class="text-[11px] leading-tight text-faint">vCPU</p>
                    </div>
                  </div>
                  <span class="summary-ring-tip">{{ cpuDetail() }}</span>
                </div>
              </div>
              <div class="min-w-0">
                <div class="summary-ring-wrap" :title="memoryDetail()">
                  <div class="summary-ring mx-auto size-20 sm:size-24" :style="usageRingStyle(memoryRingPercent())" tabindex="0" :aria-label="memoryDetail()">
                    <div class="summary-ring-inner">
                      <p class="font-mono text-sm font-semibold text-foam">{{ formatBytes(resourceMemoryBytes) }}</p>
                      <p class="text-[11px] leading-tight text-faint">RAM</p>
                    </div>
                  </div>
                  <span class="summary-ring-tip">{{ memoryDetail() }}</span>
                </div>
              </div>
            </div>

            <div v-if="currentUsage.available" class="mt-4 rounded-md bg-surface-2/70 px-3 py-2 text-center text-xs text-faint ring-1 ring-hull-soft">
              Current sample {{ relative(currentUsage.sampledAt) }} from {{ currentUsage.containers }} container(s)
            </div>

            <div class="mt-5 flex flex-wrap gap-2">
              <span class="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs text-foam ring-1 ring-hull">
                <span class="font-mono text-faint">{{ summary.networks ?? 0 }}</span> networks
              </span>
              <span class="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs text-foam ring-1 ring-hull">
                <span class="font-mono text-faint">{{ summary.volumes ?? 0 }}</span> volumes
              </span>
              <span class="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs text-foam ring-1 ring-hull">
                <span class="font-mono text-faint">{{ summary.configs ?? 0 }}</span> configs
              </span>
              <span class="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs text-foam ring-1 ring-hull">
                <span class="font-mono text-faint">{{ summary.secrets ?? 0 }}</span> secrets
              </span>
            </div>

            <dl class="mt-5 grid grid-cols-2 gap-3 text-xs">
              <div>
                <dt class="text-faint">Tasks</dt>
                <dd class="mt-1 font-mono text-foam">{{ summary.runningTasks ?? 0 }}/{{ summary.desiredTasks ?? 0 }}</dd>
              </div>
              <div>
                <dt class="text-faint">Resources</dt>
                <dd class="mt-1 font-mono text-foam">{{ resourceHint }}</dd>
              </div>
              <div>
                <dt class="text-faint">Created</dt>
                <dd class="mt-1 text-foam">{{ summary.createdAt ? relative(summary.createdAt) : '-' }}</dd>
              </div>
              <div>
                <dt class="text-faint">Updated</dt>
                <dd class="mt-1 text-foam">{{ summary.updatedAt ? relative(summary.updatedAt) : '-' }}</dd>
              </div>
            </dl>
          </section>

          <section class="panel p-4">
            <h2 class="font-display text-lg font-semibold text-foam">Secrets</h2>
            <div v-if="!secretRows.length" class="mt-6 rounded-lg border border-dashed border-hull p-6 text-center text-sm text-(--color-muted)">
              No secrets in stack.
            </div>
            <div v-else class="mt-4 divide-y divide-hull">
              <div v-for="secret in secretRows" :key="secret.id || secret.name" class="py-3">
                <p class="font-mono text-sm text-foam">{{ secret.name }}</p>
                <p class="mt-1 text-xs text-faint">{{ secret.updatedAt ? `Updated ${relative(secret.updatedAt)}` : 'Secret metadata' }}</p>
              </div>
            </div>
          </section>

          <section class="panel p-4">
            <h2 class="font-display text-lg font-semibold text-foam">Configs</h2>
            <div v-if="!configRows.length" class="mt-6 rounded-lg border border-dashed border-hull p-6 text-center text-sm text-(--color-muted)">
              No configs in stack.
            </div>
            <div v-else class="mt-4 divide-y divide-hull">
              <div v-for="config in configRows" :key="config.id || config.name" class="py-3">
                <p class="font-mono text-sm text-foam">{{ config.name }}</p>
                <p class="mt-1 text-xs text-faint">{{ config.updatedAt ? `Updated ${relative(config.updatedAt)}` : 'Config metadata' }}</p>
              </div>
            </div>
          </section>
        </div>

        <div class="space-y-4 min-w-0">
          <section class="panel p-0 overflow-hidden">
            <div class="flex items-center justify-between gap-2 px-4 py-3">
              <h2 class="font-display text-lg font-semibold text-foam">Services</h2>
              <span class="text-xs text-faint">{{ serviceRows.length }} total</span>
            </div>
            <div class="overflow-x-auto">
              <table class="min-w-full text-left text-sm">
                <thead class="border-y border-hull text-xs uppercase tracking-wide text-faint">
                  <tr>
                    <th class="px-4 py-3 font-medium">Service</th>
                    <th class="px-4 py-3 font-medium">Mode</th>
                    <th class="px-4 py-3 font-medium">Replicas</th>
                    <th class="px-4 py-3 font-medium">Ports</th>
                    <th class="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-hull">
                  <tr v-if="!serviceRows.length">
                    <td colspan="5" class="px-4 py-8 text-center text-(--color-muted)">No running services for this stack.</td>
                  </tr>
                  <tr v-for="service in serviceRows" :key="service.id" class="align-top">
                    <td class="px-4 py-3">
                      <NuxtLink :to="`/services/${service.id}`" class="font-medium text-foam hover:text-beacon">{{ service.name || '-' }}</NuxtLink>
                      <p class="mt-0.5 max-w-[28rem] truncate font-mono text-xs text-faint">{{ service.image || '-' }}</p>
                    </td>
                    <td class="px-4 py-3 font-mono text-xs text-(--color-muted)">{{ service.mode }}</td>
                    <td class="px-4 py-3 font-mono text-sm">{{ replicaLabel(service) }}</td>
                    <td class="px-4 py-3 font-mono text-xs text-(--color-muted)">{{ portsLabel(service.ports) }}</td>
                    <td class="px-4 py-3"><StatusBadge :state="service.status" /></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section class="panel p-0 overflow-hidden">
            <div class="flex items-center justify-between gap-2 px-4 py-3">
              <h2 class="font-display text-lg font-semibold text-foam">Networks</h2>
              <span class="text-xs text-faint">{{ networkRows.length }} total</span>
            </div>
            <div class="overflow-x-auto">
              <table class="min-w-full text-left text-sm">
                <thead class="border-y border-hull text-xs uppercase tracking-wide text-faint">
                  <tr>
                    <th class="px-4 py-3 font-medium">Name</th>
                    <th class="px-4 py-3 font-medium">Driver</th>
                    <th class="px-4 py-3 font-medium">Subnet</th>
                    <th class="px-4 py-3 font-medium">Gateway</th>
                    <th class="px-4 py-3 font-medium">Scope</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-hull">
                  <tr v-if="!networkRows.length">
                    <td colspan="5" class="px-4 py-8 text-center text-(--color-muted)">No networks in stack.</td>
                  </tr>
                  <tr v-for="network in networkRows" :key="network.id">
                    <td class="px-4 py-3">
                      <p class="font-mono text-sm text-foam">{{ network.name || '-' }}</p>
                      <p v-if="network.fullName && network.fullName !== network.name" class="mt-0.5 font-mono text-xs text-faint">{{ network.fullName }}</p>
                    </td>
                    <td class="px-4 py-3 font-mono text-xs text-(--color-muted)">{{ network.driver || '-' }}</td>
                    <td class="px-4 py-3 font-mono text-xs text-(--color-muted)">{{ listLabel(network.subnets) }}</td>
                    <td class="px-4 py-3 font-mono text-xs text-(--color-muted)">{{ listLabel(network.gateways) }}</td>
                    <td class="px-4 py-3 text-xs text-(--color-muted)">
                      {{ network.scope || '-' }}<span v-if="network.attachable">, attachable</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section class="panel p-0 overflow-hidden">
            <div class="flex items-center justify-between gap-2 px-4 py-3">
              <h2 class="font-display text-lg font-semibold text-foam">Volumes</h2>
              <span class="text-xs text-faint">{{ volumeRows.length }} total</span>
            </div>
            <div class="overflow-x-auto">
              <table class="min-w-full text-left text-sm">
                <thead class="border-y border-hull text-xs uppercase tracking-wide text-faint">
                  <tr>
                    <th class="px-4 py-3 font-medium">Name</th>
                    <th class="px-4 py-3 font-medium">Driver</th>
                    <th class="px-4 py-3 font-medium">Used by</th>
                    <th class="px-4 py-3 font-medium">Mountpoint</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-hull">
                  <tr v-if="!volumeRows.length">
                    <td colspan="4" class="px-4 py-8 text-center text-(--color-muted)">No volumes in stack.</td>
                  </tr>
                  <tr v-for="volume in volumeRows" :key="volume.fullName || volume.name">
                    <td class="px-4 py-3">
                      <p class="font-mono text-sm text-foam">{{ volume.name || '-' }}</p>
                      <p v-if="volume.fullName && volume.fullName !== volume.name" class="mt-0.5 font-mono text-xs text-faint">{{ volume.fullName }}</p>
                    </td>
                    <td class="px-4 py-3 font-mono text-xs text-(--color-muted)">{{ volume.driver || '-' }}</td>
                    <td class="px-4 py-3 text-xs text-(--color-muted)">{{ listLabel(volume.usedBy) }}</td>
                    <td class="px-4 py-3 max-w-xs truncate font-mono text-xs text-(--color-muted)">{{ volume.mountpoint || '-' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>

      <div v-else-if="tab === 'services'" class="space-y-2">
        <ListControls
          v-model:search="serviceSearch"
          v-model:sort-by="serviceSortBy"
          v-model:sort-dir="serviceSortDir"
          :sort-options="serviceSortOptionsState"
          placeholder="Search stack services"
        />
        <div v-if="!filteredServices.length" class="panel p-10 text-center text-sm text-(--color-muted)">
          No running services for this stack.
        </div>
        <NuxtLink v-for="s in filteredServices" :key="s.id" :to="`/services/${s.id}`"
          class="panel-flush p-3.5 flex items-center justify-between gap-3 hover:ring-1 hover:ring-beacon/30 transition group">
          <div class="flex items-center gap-2 min-w-0">
            <span class="dot" :class="s.status === 'running' ? 'dot-running' : s.status === 'pending' || s.status === 'updating' ? 'dot-pending' : s.status === 'idle' ? 'dot-idle' : 'dot-down'" />
            <div class="min-w-0">
              <p class="truncate font-medium text-foam group-hover:text-beacon">{{ s.name || '-' }}</p>
              <p class="truncate font-mono text-xs text-faint">{{ s.image || '-' }}</p>
            </div>
          </div>
          <div class="shrink-0 text-right">
            <p class="font-mono text-sm">{{ replicaLabel(s) }}</p>
            <p class="mt-0.5 max-w-48 truncate font-mono text-[11px] text-faint">{{ portsLabel(s.ports) }}</p>
          </div>
        </NuxtLink>
      </div>

      <div v-else-if="tab === 'compose'" class="panel p-0 overflow-hidden">
        <div class="flex items-center justify-between gap-2 border-b border-hull px-4 py-2.5">
          <span class="flex min-w-0 items-center gap-2 font-mono text-xs text-(--color-muted)">
            <UIcon name="i-lucide-file-code" class="size-4 shrink-0" />
            <span class="truncate">{{ name }}.yml</span>
            <UBadge :color="composeSourceTone" variant="subtle" :label="composeSourceLabel" />
          </span>
          <UButton v-if="can('operator')" size="xs" color="primary" variant="soft" icon="i-lucide-pencil" label="Edit" @click="openEdit" />
        </div>
        <pre class="logstream max-h-[65vh] overflow-auto px-4 py-3 text-xs">{{ draft || '# No compose source available for this stack.' }}</pre>
      </div>

      <div v-else-if="tab === 'history'" class="space-y-0">
        <ListControls
          v-model:search="historySearch"
          v-model:sort-by="historySortBy"
          v-model:sort-dir="historySortDir"
          :sort-options="historySortOptionsState"
          placeholder="Search history"
        />
        <div v-for="(c, i) in filteredHistory" :key="c.id" class="relative flex gap-3 pl-1">
          <div class="flex flex-col items-center">
            <span class="mt-1.5 size-2.5 rounded-full bg-beacon ring-4 ring-beacon/10" />
            <span v-if="i < filteredHistory.length - 1" class="w-px flex-1 bg-hull" />
          </div>
          <div class="panel-flush flex-1 mb-3 p-3.5">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-foam">{{ c.title || c.message || '-' }}</p>
                <p class="mt-0.5 text-xs text-faint">
                  {{ c.author_name || '-' }} - {{ relative(c.created_at || c.committed_date) }} -
                  <span class="font-mono">{{ short(c.id, 8) }}</span>
                  <span v-if="i === 0" class="status-current ml-1 rounded px-1.5 py-0.5 text-[10px]">current</span>
                </p>
              </div>
              <div class="flex gap-1.5 shrink-0">
                <UButton size="xs" color="neutral" variant="soft" icon="i-lucide-eye" label="View" @click="viewCommit(c.id)" />
                <UButton v-if="can('operator') && i > 0" size="xs" color="warning" variant="soft" icon="i-lucide-history" label="Rollback" @click="rollback(c.id)" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </DataState>

    <UModal v-model:open="editOpen" title="Edit stack" :ui="{ content: 'max-w-4xl' }">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Name">
            <UInput :model-value="name" class="w-full font-mono" disabled />
          </UFormField>
          <div class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <UFormField label="Compose source">
              <UInput :model-value="composeSourceLabel" class="w-full" disabled />
            </UFormField>
            <UFormField label="Commit message" :hint="data?.composeSource === 'engine' ? 'Creates GitLab state when GitLab is configured' : undefined">
              <UInput v-model="editMessage" class="w-full" :disabled="saving" />
            </UFormField>
          </div>
          <UFormField label="Compose file" required>
            <UTextarea v-model="draft" :rows="22" class="w-full font-mono text-xs" :ui="{ base: 'font-mono' }" spellcheck="false" :disabled="saving" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" label="Cancel" :disabled="saving" @click="cancelEdit" />
          <UButton color="primary" icon="i-lucide-rocket" label="Save and redeploy" :loading="saving" @click="redeploy" />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="diffOpen" :title="`Compose at ${short(diffSha, 8)}`" :ui="{ content: 'max-w-2xl' }">
      <template #body>
        <div v-if="diffLoading" class="flex items-center justify-center py-12 text-(--color-muted)">
          <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin mr-2" /> Loading...
        </div>
        <pre v-else class="logstream max-h-[55vh] overflow-auto rounded-lg p-3 text-xs">{{ diffContent }}</pre>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" label="Close" @click="diffOpen = false" />
          <UButton v-if="can('operator')" color="warning" icon="i-lucide-history" label="Roll back to this" @click="rollback(diffSha)" />
        </div>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
.summary-ring-wrap {
  position: relative;
}

.summary-ring {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  padding: 0.5rem;
  transition: filter 0.16s ease, transform 0.16s ease;
}

.summary-ring:focus-visible,
.summary-ring:hover {
  filter: brightness(1.08);
  transform: translateY(-1px);
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

.summary-ring-tip {
  position: absolute;
  bottom: calc(100% + 0.55rem);
  left: 50%;
  z-index: 20;
  width: max-content;
  max-width: min(18rem, 82vw);
  transform: translate(-50%, 0.25rem);
  border-radius: 0.375rem;
  background: var(--color-abyss);
  color: var(--color-foam);
  opacity: 0;
  padding: 0.45rem 0.6rem;
  pointer-events: none;
  text-align: left;
  font-size: 0.75rem;
  line-height: 1.3;
  border: 1px solid var(--color-hull);
  box-shadow: var(--panel-shadow-soft);
  transition: opacity 0.14s ease, transform 0.14s ease;
}

.summary-ring-wrap:hover .summary-ring-tip,
.summary-ring:focus-visible + .summary-ring-tip {
  opacity: 1;
  transform: translate(-50%, 0);
}
</style>
