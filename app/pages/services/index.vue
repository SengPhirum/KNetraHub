<script setup lang="ts">
const { relative } = useFormat()
const { can } = useAuth()
const { prefs } = usePreferences()
const toast = useToast()

const { data, status, error, refreshing, refresh } = useApiCache('services', () => $fetch<any[]>('/api/services'))
onMounted(refresh)

const search = ref('')
const filtered = computed(() => {
  const q = search.value.toLowerCase()
  return (data.value ?? []).filter((s) =>
    !q || s.name?.toLowerCase().includes(q) || s.image?.toLowerCase().includes(q) || s.stack?.toLowerCase().includes(q)
  )
})

// ── live updates ──────────────────────────────────────────────────────────────
const { connected } = useDockerEvents((evt) => {
  if (['service', 'task', 'container'].includes(evt.type)) refresh()
})

useIntervalFn(() => {
  if (!connected.value && prefs.value.refreshInterval > 0) refresh()
}, computed(() => prefs.value.refreshInterval > 0 ? prefs.value.refreshInterval * 1000 : 60_000), { immediate: false })

// ── scale ─────────────────────────────────────────────────────────────────────
const scaleTarget = ref<any>(null)
const scaleValue = ref(1)
function openScale(svc: any) { scaleTarget.value = svc; scaleValue.value = svc.replicas ?? 1 }
async function doScale() {
  try {
    await $fetch(`/api/services/${scaleTarget.value.id}/scale`, { method: 'POST', body: { replicas: Number(scaleValue.value) } })
    toast.add({ title: `Scaled ${scaleTarget.value.name} → ${scaleValue.value}`, color: 'primary', icon: 'i-lucide-scaling' })
    scaleTarget.value = null
    refresh()
  } catch (e: any) { toast.add({ title: 'Scale failed', description: e?.data?.statusMessage, color: 'error' }) }
}

async function redeploy(svc: any) {
  try {
    await $fetch(`/api/services/${svc.id}/redeploy`, { method: 'POST' })
    toast.add({ title: `Redeploying ${svc.name}`, color: 'primary', icon: 'i-lucide-refresh-cw' })
    refresh()
  } catch (e: any) { toast.add({ title: 'Redeploy failed', description: e?.data?.statusMessage, color: 'error' }) }
}

async function remove(svc: any) {
  if (!confirm(`Remove service "${svc.name}"? This stops all its tasks.`)) return
  // Optimistic remove
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
</script>

<template>
  <div>
    <PageHeader title="Services" subtitle="Replicated and global workloads across the swarm" icon="i-lucide-boxes">
      <template #actions>
        <div class="flex items-center gap-1.5 text-xs text-faint select-none">
          <span class="dot" :class="connected ? 'dot-running' : 'dot-idle'" />
          {{ connected ? 'Live' : prefs.refreshInterval > 0 ? `${prefs.refreshInterval}s` : 'Manual' }}
        </div>
        <UInput v-model="search" icon="i-lucide-search" placeholder="Filter services" class="w-44 sm:w-56" />
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" :loading="refreshing" @click="refresh()" />
      </template>
    </PageHeader>

    <DataState :status="status" :error="error" :empty="filtered.length === 0" :refreshing="refreshing" empty-label="No services running." empty-icon="i-lucide-boxes">
      <TransitionGroup name="list" tag="div" class="space-y-2">
        <div v-for="svc in filtered" :key="svc.id"
          class="panel-flush p-3.5 grid grid-cols-2 gap-3 sm:grid-cols-12 sm:items-center">
          <div class="col-span-2 sm:col-span-4 min-w-0">
            <NuxtLink :to="`/services/${svc.id}`" class="flex items-center gap-2 group">
              <span class="dot" :class="svc.running >= (svc.replicas ?? 1) && (svc.running > 0 || svc.replicas === 0) ? 'dot-running' : svc.running > 0 ? 'dot-pending' : 'dot-down'" />
              <span class="truncate font-medium text-foam group-hover:text-beacon">{{ svc.name || '—' }}</span>
            </NuxtLink>
            <p class="mt-1 truncate pl-4 font-mono text-xs text-faint">{{ svc.image || '—' }}</p>
          </div>
          <div class="sm:col-span-2 min-w-0">
            <NuxtLink v-if="svc.stack" :to="`/stacks/${svc.stack}`" class="inline-flex items-center gap-1 rounded bg-surface-2 px-2 py-0.5 text-xs text-(--color-muted) hover:text-foam">
              <UIcon name="i-lucide-layers" class="size-3" /> {{ svc.stack }}
            </NuxtLink>
            <span v-else class="text-xs text-faint">—</span>
          </div>
          <div class="sm:col-span-2">
            <p class="font-mono text-sm text-foam">
              <span :class="svc.running >= (svc.replicas ?? 1) ? 'status-running' : 'status-pending'">{{ svc.running ?? 0 }}</span>
              <span class="text-faint">/{{ svc.mode === 'global' ? 'global' : (svc.replicas ?? '—') }}</span>
            </p>
            <p class="text-xs text-faint capitalize">{{ svc.mode || '—' }}</p>
          </div>
          <div class="sm:col-span-2 min-w-0">
            <div v-if="svc.ports?.length" class="flex flex-wrap gap-1">
              <span v-for="(p, i) in svc.ports.slice(0, 2)" :key="i" class="font-mono text-xs text-(--color-muted)">{{ p.published || '*' }}:{{ p.target || '?' }}</span>
              <span v-if="svc.ports.length > 2" class="text-xs text-faint">+{{ svc.ports.length - 2 }}</span>
            </div>
            <span v-else class="text-xs text-faint">—</span>
          </div>
          <div class="col-span-2 sm:col-span-2 flex items-center justify-between sm:justify-end gap-2">
            <span class="text-xs text-faint sm:hidden">{{ relative(svc.updatedAt) }}</span>
            <UDropdownMenu :items="menu(svc)" :content="{ align: 'end' }">
              <UButton icon="i-lucide-ellipsis-vertical" color="neutral" variant="ghost" size="sm" aria-label="Actions" />
            </UDropdownMenu>
          </div>
        </div>
      </TransitionGroup>
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
