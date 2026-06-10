<script setup lang="ts">
const { can } = useAuth()
const { relative, short } = useFormat()
const toast = useToast()
const { data, status, error, refresh } = await useFetch('/api/secrets', { lazy: true })

const open = ref(false)
const form = reactive({ name: '', data: '' })
function openCreate() { Object.assign(form, { name: '', data: '' }); open.value = true }
async function create() {
  if (!form.name || !form.data) { toast.add({ title: 'Name and value required', color: 'warning' }); return }
  try {
    await $fetch('/api/secrets', { method: 'POST', body: { name: form.name, data: btoa(form.data) } })
    toast.add({ title: `Created ${form.name}`, color: 'primary', icon: 'i-lucide-key-round' })
    open.value = false
    setTimeout(refresh, 500)
  } catch (e: any) { toast.add({ title: 'Create failed', description: e?.data?.statusMessage, color: 'error' }) }
}
async function remove(s: any) {
  if (!confirm(`Delete secret "${s.name}"? Services using it must be updated first.`)) return
  try {
    await $fetch(`/api/secrets/${s.id}`, { method: 'DELETE' })
    toast.add({ title: `Deleted ${s.name}`, color: 'primary' })
    refresh()
  } catch (e: any) { toast.add({ title: 'Delete failed', description: e?.data?.statusMessage, color: 'error' }) }
}
</script>

<template>
  <div>
    <PageHeader title="Secrets" subtitle="Encrypted secrets distributed to services" icon="i-lucide-key-round">
      <template #actions>
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" @click="refresh()" />
        <UButton v-if="can('operator')" icon="i-lucide-plus" color="primary" label="Create" @click="openCreate" />
      </template>
    </PageHeader>

    <div class="panel p-3 mb-4 border-hull flex items-center gap-2 text-xs text-(--color-muted)">
      <UIcon name="i-lucide-shield" class="size-4 shrink-0 text-beacon" />
      Secret values are write-only — Docker never exposes them after creation.
    </div>

    <DataState :status="status" :error="error" :empty="!data?.length" empty-label="No secrets." empty-icon="i-lucide-key-round">
      <div class="space-y-2">
        <div v-for="s in data" :key="s.id" class="panel-flush p-3.5 grid grid-cols-2 gap-3 sm:grid-cols-12 sm:items-center">
          <div class="col-span-2 sm:col-span-6 min-w-0">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-key-round" class="size-4 text-(--color-muted)" />
              <span class="truncate font-medium text-foam">{{ s.name }}</span>
              <span v-if="s.stack" class="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-faint">{{ s.stack }}</span>
            </div>
            <p class="mt-1 truncate pl-6 font-mono text-xs text-faint">{{ short(s.id) }}</p>
          </div>
          <div class="sm:col-span-5 text-xs text-faint">Created {{ relative(s.created) }}</div>
          <div class="col-span-2 sm:col-span-1 flex justify-end">
            <UButton v-if="can('operator')" icon="i-lucide-trash-2" color="error" variant="ghost" size="sm" @click="remove(s)" />
          </div>
        </div>
      </div>
    </DataState>

    <UModal v-model:open="open" title="Create secret">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Name" required><UInput v-model="form.name" class="w-full font-mono" placeholder="db_password" /></UFormField>
          <UFormField label="Value" required hint="Stored encrypted; cannot be read back"><UTextarea v-model="form.data" :rows="5" class="w-full font-mono text-xs" spellcheck="false" /></UFormField>
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
