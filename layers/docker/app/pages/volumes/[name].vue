<script setup lang="ts">
const route = useRoute()
const name = route.params.name as string
const { can } = useAuth()
const { prefs } = usePreferences()
const toast = useToast()

const encodedName = computed(() => encodeURIComponent(name))
const { data, status, error, refreshing, refresh } = useApiCache(`volume:${name}`, () => $fetch<any>(`/api/volumes/${encodedName.value}`))
onMounted(refresh)

const { connected } = useDockerEvents((evt) => {
  if (evt.type === 'resource-detail' && evt.resource === 'volume' && evt.id === name) data.value = evt.data
})
useIntervalFn(() => {
  if (!connected.value && prefs.value.refreshInterval > 0) refresh()
}, computed(() => prefs.value.refreshInterval > 0 ? prefs.value.refreshInterval * 1000 : 60_000), { immediate: false })

const title = computed(() => `Volume ${data.value?.name || name}`)

// Deleting a volume destroys its data - it must be confirmed with the user's
// password (enforced server-side, see requirePasswordConfirm).
const removeOpen = ref(false)
function remove() {
  if (data.value) removeOpen.value = true
}
async function confirmRemove(password: string) {
  await $fetch(`/api/volumes/${encodedName.value}?force=true`, { method: 'DELETE', headers: { 'x-confirm-password': password } })
  toast.add({ title: `Deleted ${data.value?.name}`, color: 'primary' })
  navigateTo('/volumes')
}
</script>

<template>
  <div>
    <PageHeader :title="title" subtitle="Volume detail" icon="i-lucide-database">
      <template #actions>
        <div class="flex items-center gap-1.5 text-xs text-faint select-none">
          <span class="dot" :class="connected ? 'dot-running' : 'dot-idle'" />
          {{ connected ? 'Live' : prefs.refreshInterval > 0 ? `${prefs.refreshInterval}s` : 'Manual' }}
        </div>
        <UButton icon="i-lucide-arrow-left" color="neutral" variant="ghost" to="/volumes" label="Back" />
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" :loading="refreshing" @click="refresh()" />
        <UButton v-if="can('operator')" icon="i-lucide-trash-2" color="error" variant="soft" label="Delete" @click="remove" />
      </template>
    </PageHeader>

    <DataState :status="status" :error="error" :refreshing="refreshing">
      <div class="space-y-4">
        <section class="panel p-0 overflow-hidden">
          <dl class="divide-y divide-hull text-sm">
            <div class="grid gap-3 px-4 py-3 sm:grid-cols-[13rem_minmax(0,1fr)]">
              <dt class="text-faint">Driver</dt>
              <dd class="font-mono text-foam">{{ data?.driver || '-' }}</dd>
            </div>
            <div class="grid gap-3 px-4 py-3 sm:grid-cols-[13rem_minmax(0,1fr)]">
              <dt class="text-faint">Scope</dt>
              <dd class="font-mono text-foam">{{ data?.scope || '-' }}</dd>
            </div>
            <div class="grid gap-3 px-4 py-3 sm:grid-cols-[13rem_minmax(0,1fr)]">
              <dt class="text-faint">Mountpoint</dt>
              <dd class="break-all font-mono text-foam">{{ data?.mountpoint || '-' }}</dd>
            </div>
          </dl>
          <div v-if="data?.stack" class="border-t border-hull px-4 py-3">
            <UButton size="xs" color="primary" variant="ghost" icon="i-lucide-layers" label="See stack" :to="`/stacks/${data.stack}`" />
          </div>
        </section>

        <ResourceServicesTable :services="data?.services" empty-label="No services use this volume." />
      </div>
    </DataState>

    <ConfirmPasswordModal
      v-model:open="removeOpen"
      title="Delete volume"
      :message="`Volume ${data?.name || name} and all data stored in it will be permanently deleted.`"
      confirm-label="Delete volume"
      :action="confirmRemove"
    />
  </div>
</template>
