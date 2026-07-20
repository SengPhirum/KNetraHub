<script setup lang="ts">
const route = useRoute()
const id = route.params.id as string
const { can } = useAuth()
const { relative, short } = useFormat()
const { prefs } = usePreferences()
const toast = useToast()

const { data, status, error, refreshing, refresh } = useApiCache(`secret:${id}`, () => $fetch<any>(`/api/secrets/${id}`))
onMounted(refresh)

const { connected } = useDockerEvents((evt) => {
  if (evt.type === 'resource-detail' && evt.resource === 'secret' && evt.id === id) data.value = evt.data
})
useIntervalFn(() => {
  if (!connected.value && prefs.value.refreshInterval > 0) refresh()
}, computed(() => prefs.value.refreshInterval > 0 ? prefs.value.refreshInterval * 1000 : 60_000), { immediate: false })

const title = computed(() => `Secret ${data.value?.name || short(id, 12)}`)

const deleteOpen = ref(false)
async function confirmRemove(headers: Record<string, string>) {
  if (!data.value) return
  await $fetch(`/api/secrets/${id}`, { method: 'DELETE', headers })
  toast.add({ title: `Deleted ${data.value.name}`, color: 'primary' })
  navigateTo('/secrets')
}
</script>

<template>
  <div>
    <PageHeader :title="title" subtitle="Secret detail" icon="i-lucide-key-round">
      <template #actions>
        <div class="flex items-center gap-1.5 text-xs text-faint select-none">
          <span class="dot" :class="connected ? 'dot-running' : 'dot-idle'" />
          {{ connected ? 'Live' : prefs.refreshInterval > 0 ? `${prefs.refreshInterval}s` : 'Manual' }}
        </div>
        <UButton icon="i-lucide-arrow-left" color="neutral" variant="ghost" to="/secrets" label="Back" />
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" :loading="refreshing" @click="refresh()" />
        <UButton v-if="can('operator')" icon="i-lucide-trash-2" color="error" variant="soft" label="Delete" @click="deleteOpen = true" />
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

        <ResourceServicesTable :services="data?.services" empty-label="No services use this secret." />
      </div>
    </DataState>

    <ConfirmDeleteModal
      type="docker.secret"
      :item-name="data?.name"
      v-model:open="deleteOpen"
      title="Delete secret"
      :message="data ? `Secret ${data.name} will be permanently removed. Services using it must be updated first.` : ''"
      :action="confirmRemove"
    />
  </div>
</template>
