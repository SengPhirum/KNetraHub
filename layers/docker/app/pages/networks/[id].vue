<script setup lang="ts">
const route = useRoute()
const id = route.params.id as string
const { can } = useAuth()
const { relative, short } = useFormat()
const { prefs } = usePreferences()
const toast = useToast()

const { data, status, error, refreshing, refresh } = useApiCache(`network:${id}`, () => $fetch<any>(`/api/networks/${id}`))
onMounted(refresh)

const { connected } = useDockerEvents((evt) => {
  if (['network', 'service', 'task', 'container'].includes(evt.type)) refresh()
})
useIntervalFn(() => {
  if (!connected.value && prefs.value.refreshInterval > 0) refresh()
}, computed(() => prefs.value.refreshInterval > 0 ? prefs.value.refreshInterval * 1000 : 60_000), { immediate: false })

const title = computed(() => `Network ${data.value?.name || short(id, 12)}`)
const options = computed(() => Object.entries(data.value?.options || {}) as Array<[string, string]>)

function listLabel(items: string[] = []) {
  return items.length ? items.join(', ') : '-'
}

async function remove() {
  if (!data.value || !confirm(`Delete network "${data.value.name}"?`)) return
  try {
    await $fetch(`/api/networks/${id}`, { method: 'DELETE' })
    toast.add({ title: `Deleted ${data.value.name}`, color: 'primary' })
    navigateTo('/networks')
  } catch (e: any) {
    toast.add({ title: 'Delete failed', description: e?.data?.statusMessage, color: 'error' })
  }
}
</script>

<template>
  <div>
    <PageHeader :title="title" subtitle="Network detail" icon="i-lucide-network">
      <template #actions>
        <div class="flex items-center gap-1.5 text-xs text-faint select-none">
          <span class="dot" :class="connected ? 'dot-running' : 'dot-idle'" />
          {{ connected ? 'Live' : prefs.refreshInterval > 0 ? `${prefs.refreshInterval}s` : 'Manual' }}
        </div>
        <UButton icon="i-lucide-arrow-left" color="neutral" variant="ghost" to="/networks" label="Back" />
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" :loading="refreshing" @click="refresh()" />
        <UButton v-if="can('operator')" icon="i-lucide-trash-2" color="error" variant="soft" label="Delete" @click="remove" />
      </template>
    </PageHeader>

    <DataState :status="status" :error="error" :refreshing="refreshing">
      <div class="space-y-4">
        <section class="panel p-0 overflow-hidden">
          <div class="flex flex-wrap gap-2 border-b border-hull px-4 py-3">
            <UBadge v-if="data?.attachable" color="primary" variant="subtle" label="Attachable" />
            <UBadge v-if="data?.internal" color="neutral" variant="subtle" label="Internal" />
            <UBadge v-if="data?.ingress" color="warning" variant="subtle" label="Ingress" />
          </div>
          <dl class="divide-y divide-hull text-sm">
            <div class="grid gap-3 px-4 py-3 sm:grid-cols-[13rem_minmax(0,1fr)]">
              <dt class="text-faint">ID</dt>
              <dd class="break-all font-mono text-foam">{{ data?.id || '-' }}</dd>
            </div>
            <div class="grid gap-3 px-4 py-3 sm:grid-cols-[13rem_minmax(0,1fr)]">
              <dt class="text-faint">Driver</dt>
              <dd class="font-mono text-foam">{{ data?.driver || '-' }}</dd>
            </div>
            <div class="grid gap-3 px-4 py-3 sm:grid-cols-[13rem_minmax(0,1fr)]">
              <dt class="text-faint">Created</dt>
              <dd class="text-foam">{{ relative(data?.created) }}</dd>
            </div>
            <div class="grid gap-3 px-4 py-3 sm:grid-cols-[13rem_minmax(0,1fr)]">
              <dt class="text-faint">Subnet</dt>
              <dd class="font-mono text-foam">{{ listLabel(data?.subnets) }}</dd>
            </div>
            <div class="grid gap-3 px-4 py-3 sm:grid-cols-[13rem_minmax(0,1fr)]">
              <dt class="text-faint">Gateway</dt>
              <dd class="font-mono text-foam">{{ listLabel(data?.gateways) }}</dd>
            </div>
          </dl>
          <div v-if="data?.stack" class="border-t border-hull px-4 py-3">
            <UButton size="xs" color="primary" variant="ghost" icon="i-lucide-layers" label="See stack" :to="`/stacks/${data.stack}`" />
          </div>
        </section>

        <section v-if="options.length" class="panel p-4">
          <h2 class="font-display text-lg font-semibold text-foam">Driver settings</h2>
          <dl class="mt-4 grid gap-3 text-sm">
            <div v-for="[key, value] in options" :key="key">
              <dt class="break-all font-mono text-foam">{{ key }}</dt>
              <dd class="mt-0.5 break-all font-mono text-xs text-faint">{{ value }}</dd>
            </div>
          </dl>
        </section>

        <ResourceServicesTable :services="data?.services" empty-label="No services use this network." />
      </div>
    </DataState>
  </div>
</template>
