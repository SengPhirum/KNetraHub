<script setup lang="ts">
const { can } = useAuth()
const { relative } = useFormat()
const toast = useToast()
const { data, status, error, refresh } = await useFetch('/api/volumes', { lazy: true })

const open = ref(false)
const form = reactive({ name: '', driver: 'local' })
function openCreate() { Object.assign(form, { name: '', driver: 'local' }); open.value = true }
async function create() {
  if (!form.name) { toast.add({ title: 'Name required', color: 'warning' }); return }
  try {
    await $fetch('/api/volumes', { method: 'POST', body: { ...form } })
    toast.add({ title: `Created ${form.name}`, color: 'primary', icon: 'i-lucide-database' })
    open.value = false
    setTimeout(refresh, 500)
  } catch (e: any) { toast.add({ title: 'Create failed', description: e?.data?.statusMessage, color: 'error' }) }
}
async function remove(v: any) {
  if (!confirm(`Delete volume "${v.name}"? Data will be lost.`)) return
  try {
    await $fetch(`/api/volumes/${encodeURIComponent(v.name)}?force=true`, { method: 'DELETE' })
    toast.add({ title: `Deleted ${v.name}`, color: 'primary' })
    refresh()
  } catch (e: any) { toast.add({ title: 'Delete failed', description: e?.data?.statusMessage, color: 'error' }) }
}
</script>

<template>
  <div>
    <PageHeader title="Volumes" subtitle="Persistent data volumes" icon="i-lucide-database">
      <template #actions>
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" @click="refresh()" />
        <UButton v-if="can('operator')" icon="i-lucide-plus" color="primary" label="Create" @click="openCreate" />
      </template>
    </PageHeader>

    <DataState :status="status" :error="error" :empty="!data?.length" empty-label="No volumes." empty-icon="i-lucide-database">
      <div class="space-y-2">
        <div v-for="v in data" :key="v.name" class="panel-flush p-3.5 grid grid-cols-2 gap-3 sm:grid-cols-12 sm:items-center">
          <div class="col-span-2 sm:col-span-5 min-w-0">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-database" class="size-4 text-[var(--color-muted)]" />
              <span class="truncate font-medium text-[var(--color-foam)]">{{ v.name }}</span>
            </div>
            <p class="mt-1 truncate pl-6 font-mono text-xs text-[var(--color-faint)]">{{ v.mountpoint }}</p>
          </div>
          <div class="sm:col-span-2 font-mono text-xs text-[var(--color-muted)]">{{ v.driver }}</div>
          <div class="sm:col-span-2 text-xs text-[var(--color-muted)]">{{ v.scope }}</div>
          <div class="sm:col-span-2 text-xs text-[var(--color-faint)]">{{ relative(v.created) }}</div>
          <div class="col-span-2 sm:col-span-1 flex justify-end">
            <UButton v-if="can('operator')" icon="i-lucide-trash-2" color="error" variant="ghost" size="sm" @click="remove(v)" />
          </div>
        </div>
      </div>
    </DataState>

    <UModal v-model:open="open" title="Create volume">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Name" required><UInput v-model="form.name" class="w-full font-mono" placeholder="app-data" /></UFormField>
          <UFormField label="Driver"><UInput v-model="form.driver" class="w-full font-mono" /></UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" label="Cancel" @click="open = false" />
          <UButton color="primary" label="Create" icon="i-lucide-check" @click="create" />
        </div>
      </template>
    </UModal>
  </div>
</template>
