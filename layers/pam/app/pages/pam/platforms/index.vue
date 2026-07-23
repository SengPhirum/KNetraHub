<script setup lang="ts">
// Platforms — target system definitions and their connectors.
const toast = useToast()
const { canManagePlatforms } = usePam()
const { data, status, error, refresh } = useAsyncData('pamPlatforms',
  () => $fetch<any[]>('/api/pam/v1/platforms'), { server: false, default: () => [] })
const { data: connectors } = useAsyncData('pamConnectorsForPlatforms',
  () => $fetch<any[]>('/api/pam/v1/connectors'), { server: false, default: () => [] })

const showCreate = ref(false)
const creating = ref(false)
const form = reactive({ name: '', slug: '', base_type: 'generic', connector_key: 'generic' })

async function create() {
  creating.value = true
  try {
    await $fetch('/api/pam/v1/platforms', { method: 'POST', body: { ...form } })
    toast.add({ title: 'Platform created', color: 'success' })
    showCreate.value = false
    await refresh()
  } catch (e: any) { toast.add({ title: 'Could not create', description: e?.data?.statusMessage, color: 'error' }) }
  finally { creating.value = false }
}
</script>

<template>
  <div>
    <PageHeader title="Platforms" subtitle="Target definitions, connectors and lifecycle policy" icon="i-lucide-layers">
      <template v-if="canManagePlatforms" #actions><UButton icon="i-lucide-plus" size="sm" @click="showCreate = true">New platform</UButton></template>
    </PageHeader>
    <DataState :status="status" :error="error" :empty="!data?.length" empty-label="No platforms.">
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div v-for="p in data" :key="p.id" class="panel p-4">
          <div class="mb-1 flex items-center justify-between">
            <p class="font-display font-semibold text-foam">{{ p.name }}</p>
            <span v-if="p.builtin" class="rounded bg-surface-2 px-1.5 py-0.5 text-xs text-faint">built-in</span>
          </div>
          <p class="mb-2 font-mono text-xs text-faint">{{ p.base_type }}</p>
          <div class="flex flex-wrap items-center gap-2 text-xs">
            <span v-if="p.connector" class="rounded px-1.5 py-0.5" :class="p.connector.runsInProcess ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'">
              {{ p.connector.key }}{{ p.connector.runsInProcess ? '' : ' · runner' }}
            </span>
            <span class="text-faint">{{ p.account_count }} accounts</span>
          </div>
        </div>
      </div>
    </DataState>

    <UModal v-model:open="showCreate" title="New platform">
      <template #body>
        <div class="space-y-3">
          <UFormField label="Name" required><UInput v-model="form.name" /></UFormField>
          <UFormField label="Slug"><UInput v-model="form.slug" /></UFormField>
          <UFormField label="Connector">
            <USelect v-model="form.connector_key" :items="(connectors||[]).map(c=>({label:c.label,value:c.key}))" />
          </UFormField>
          <UFormField label="Base type"><UInput v-model="form.base_type" placeholder="linux-ssh / database-postgresql / generic" /></UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="showCreate = false">Cancel</UButton>
          <UButton :loading="creating" :disabled="!form.name" @click="create">Create</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
