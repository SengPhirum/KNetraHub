<script setup lang="ts">
const route = useRoute()
const id = route.params.id as string
const { can } = useAuth()
const { relative, short } = useFormat()
const { prefs } = usePreferences()
const toast = useToast()

const { data, status, error, refreshing, refresh } = useApiCache(`config:${id}`, () => $fetch<any>(`/api/configs/${id}`))
onMounted(refresh)

const { connected } = useDockerEvents((evt) => {
  if (['config', 'service', 'task', 'container'].includes(evt.type)) refresh()
})
useIntervalFn(() => {
  if (!connected.value && prefs.value.refreshInterval > 0) refresh()
}, computed(() => prefs.value.refreshInterval > 0 ? prefs.value.refreshInterval * 1000 : 60_000), { immediate: false })

const title = computed(() => `Config ${data.value?.name || short(id, 12)}`)
const displayData = computed(() => {
  const raw = data.value?.data || ''
  if (!raw.trim()) return ''
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
})
const dataLines = computed(() => displayData.value ? displayData.value.split(/\r?\n/) : [])
const lineNumberWidth = computed(() => `${String(Math.max(dataLines.value.length, 1)).length}ch`)

async function remove() {
  if (!data.value || !confirm(`Delete config "${data.value.name}"?`)) return
  try {
    await $fetch(`/api/configs/${id}`, { method: 'DELETE' })
    toast.add({ title: `Deleted ${data.value.name}`, color: 'primary' })
    navigateTo('/configs')
  } catch (e: any) {
    toast.add({ title: 'Delete failed', description: e?.data?.statusMessage, color: 'error' })
  }
}
</script>

<template>
  <div>
    <PageHeader :title="title" subtitle="Config detail" icon="i-lucide-file-cog">
      <template #actions>
        <div class="flex items-center gap-1.5 text-xs text-faint select-none">
          <span class="dot" :class="connected ? 'dot-running' : 'dot-idle'" />
          {{ connected ? 'Live' : prefs.refreshInterval > 0 ? `${prefs.refreshInterval}s` : 'Manual' }}
        </div>
        <UButton icon="i-lucide-arrow-left" color="neutral" variant="ghost" to="/configs" label="Back" />
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" :loading="refreshing" @click="refresh()" />
        <UButton v-if="can('operator')" icon="i-lucide-trash-2" color="error" variant="soft" label="Delete" @click="remove" />
      </template>
    </PageHeader>

    <DataState :status="status" :error="error" :refreshing="refreshing">
      <div class="space-y-4">
        <section class="panel p-0 overflow-hidden">
          <dl class="divide-y divide-hull text-sm">
            <div class="grid gap-3 px-4 py-3 sm:grid-cols-[13rem_minmax(0,1fr)]">
              <dt class="text-faint">ID</dt>
              <dd class="break-all font-mono text-foam">{{ data?.id || '-' }}</dd>
            </div>
            <div class="grid gap-3 px-4 py-3 sm:grid-cols-[13rem_minmax(0,1fr)]">
              <dt class="text-faint">Created</dt>
              <dd class="text-foam">{{ relative(data?.created) }}</dd>
            </div>
            <div class="grid gap-3 px-4 py-3 sm:grid-cols-[13rem_minmax(0,1fr)]">
              <dt class="text-faint">Last update</dt>
              <dd class="text-foam">{{ relative(data?.updated) }}</dd>
            </div>
          </dl>
          <div v-if="data?.stack" class="border-t border-hull px-4 py-3">
            <UButton size="xs" color="primary" variant="ghost" icon="i-lucide-layers" label="See stack" :to="`/stacks/${data.stack}`" />
          </div>
        </section>

        <section class="panel p-0 overflow-hidden">
          <div class="border-b border-hull px-4 py-4">
            <h2 class="font-display text-lg font-semibold text-foam">Data</h2>
          </div>
          <div v-if="!dataLines.length" class="p-8 text-center text-sm text-(--color-muted)">
            No config data.
          </div>
          <div v-else class="logstream m-4 max-h-[58vh] overflow-auto p-3 text-xs">
            <div v-for="(line, index) in dataLines" :key="index" class="flex gap-3 font-mono leading-relaxed">
              <span class="shrink-0 select-none text-right text-faint" :style="{ width: lineNumberWidth }">{{ index + 1 }}</span>
              <code class="min-w-0 flex-1 whitespace-pre-wrap break-words text-foam">{{ line || ' ' }}</code>
            </div>
          </div>
        </section>

        <ResourceServicesTable :services="data?.services" empty-label="No services use this config." />
      </div>
    </DataState>
  </div>
</template>
