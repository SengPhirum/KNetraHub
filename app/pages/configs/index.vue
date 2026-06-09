<script setup lang="ts">
const { can } = useAuth()
const { relative, short } = useFormat()
const toast = useToast()
const { data, status, error, refresh } = await useFetch('/api/configs', { lazy: true })

const open = ref(false)
const form = reactive({ name: '', data: '' })
function openCreate() { Object.assign(form, { name: '', data: '' }); open.value = true }
async function create() {
  if (!form.name || !form.data) { toast.add({ title: 'Name and content required', color: 'warning' }); return }
  try {
    await $fetch('/api/configs', { method: 'POST', body: { name: form.name, data: btoa(form.data) } })
    toast.add({ title: `Created ${form.name}`, color: 'primary', icon: 'i-lucide-file-cog' })
    open.value = false
    setTimeout(refresh, 500)
  } catch (e: any) { toast.add({ title: 'Create failed', description: e?.data?.statusMessage, color: 'error' }) }
}

const viewOpen = ref(false)
const viewName = ref('')
const viewData = ref('')
const viewLoading = ref(false)
async function view(c: any) {
  viewName.value = c.name; viewOpen.value = true; viewLoading.value = true; viewData.value = ''
  try {
    const res: any = await $fetch(`/api/configs/${c.id}`)
    viewData.value = res.data || ''
  } catch (e: any) { viewData.value = `Failed: ${e?.data?.statusMessage}` } finally { viewLoading.value = false }
}

async function remove(c: any) {
  if (!confirm(`Delete config "${c.name}"?`)) return
  try {
    await $fetch(`/api/configs/${c.id}`, { method: 'DELETE' })
    toast.add({ title: `Deleted ${c.name}`, color: 'primary' })
    refresh()
  } catch (e: any) { toast.add({ title: 'Delete failed', description: e?.data?.statusMessage, color: 'error' }) }
}
</script>

<template>
  <div>
    <PageHeader title="Configs" subtitle="Non-sensitive configuration delivered to services" icon="i-lucide-file-cog">
      <template #actions>
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" @click="refresh()" />
        <UButton v-if="can('operator')" icon="i-lucide-plus" color="primary" label="Create" @click="openCreate" />
      </template>
    </PageHeader>

    <DataState :status="status" :error="error" :empty="!data?.length" empty-label="No configs." empty-icon="i-lucide-file-cog">
      <div class="space-y-2">
        <div v-for="c in data" :key="c.id" class="panel-flush p-3.5 grid grid-cols-2 gap-3 sm:grid-cols-12 sm:items-center">
          <div class="col-span-2 sm:col-span-6 min-w-0">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-file-cog" class="size-4 text-[var(--color-muted)]" />
              <span class="truncate font-medium text-[var(--color-foam)]">{{ c.name }}</span>
              <span v-if="c.stack" class="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--color-faint)]">{{ c.stack }}</span>
            </div>
            <p class="mt-1 truncate pl-6 font-mono text-xs text-[var(--color-faint)]">{{ short(c.id) }}</p>
          </div>
          <div class="sm:col-span-4 text-xs text-[var(--color-faint)]">Created {{ relative(c.created) }}</div>
          <div class="col-span-2 sm:col-span-2 flex justify-end gap-1">
            <UButton icon="i-lucide-eye" color="neutral" variant="ghost" size="sm" @click="view(c)" />
            <UButton v-if="can('operator')" icon="i-lucide-trash-2" color="error" variant="ghost" size="sm" @click="remove(c)" />
          </div>
        </div>
      </div>
    </DataState>

    <UModal v-model:open="open" title="Create config">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Name" required><UInput v-model="form.name" class="w-full font-mono" placeholder="nginx.conf" /></UFormField>
          <UFormField label="Content" required><UTextarea v-model="form.data" :rows="10" class="w-full font-mono text-xs" spellcheck="false" /></UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" label="Cancel" @click="open = false" />
          <UButton color="primary" label="Create" icon="i-lucide-check" @click="create" />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="viewOpen" :title="viewName" :ui="{ content: 'max-w-2xl' }">
      <template #body>
        <div v-if="viewLoading" class="flex items-center justify-center py-12 text-[var(--color-muted)]"><UIcon name="i-lucide-loader-circle" class="size-5 animate-spin mr-2" /> Loading…</div>
        <pre v-else class="logstream max-h-[55vh] overflow-auto rounded-lg p-3 text-xs whitespace-pre-wrap">{{ viewData }}</pre>
      </template>
    </UModal>
  </div>
</template>
