<script setup lang="ts">
const { can } = useAuth()
const { short } = useFormat()
const toast = useToast()
const { data, status, error, refresh } = await useFetch('/api/networks', { lazy: true })

const open = ref(false)
const form = reactive({ name: '', driver: 'overlay', subnet: '', attachable: true, internal: false })
function openCreate() { Object.assign(form, { name: '', driver: 'overlay', subnet: '', attachable: true, internal: false }); open.value = true }
async function create() {
  if (!form.name) { toast.add({ title: 'Name required', color: 'warning' }); return }
  try {
    await $fetch('/api/networks', { method: 'POST', body: { ...form } })
    toast.add({ title: `Created ${form.name}`, color: 'primary', icon: 'i-lucide-network' })
    open.value = false
    setTimeout(refresh, 500)
  } catch (e: any) { toast.add({ title: 'Create failed', description: e?.data?.statusMessage, color: 'error' }) }
}
async function remove(n: any) {
  if (!confirm(`Delete network "${n.name}"?`)) return
  try {
    await $fetch(`/api/networks/${n.id}`, { method: 'DELETE' })
    toast.add({ title: `Deleted ${n.name}`, color: 'primary' })
    refresh()
  } catch (e: any) { toast.add({ title: 'Delete failed', description: e?.data?.statusMessage, color: 'error' }) }
}
const SYSTEM = ['bridge', 'host', 'none', 'docker_gwbridge', 'ingress']
</script>

<template>
  <div>
    <PageHeader title="Networks" subtitle="Overlay and bridge networks" icon="i-lucide-network">
      <template #actions>
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" @click="refresh()" />
        <UButton v-if="can('operator')" icon="i-lucide-plus" color="primary" label="Create" @click="openCreate" />
      </template>
    </PageHeader>

    <DataState :status="status" :error="error" :empty="!data?.length" empty-label="No networks." empty-icon="i-lucide-network">
      <div class="space-y-2">
        <div v-for="n in data" :key="n.id" class="panel-flush p-3.5 grid grid-cols-2 gap-3 sm:grid-cols-12 sm:items-center">
          <div class="col-span-2 sm:col-span-4 min-w-0">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-network" class="size-4 text-[var(--color-muted)]" />
              <span class="truncate font-medium text-[var(--color-foam)]">{{ n.name }}</span>
              <span v-if="n.stack" class="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--color-faint)]">{{ n.stack }}</span>
            </div>
            <p class="mt-1 truncate pl-6 font-mono text-xs text-[var(--color-faint)]">{{ short(n.id) }}</p>
          </div>
          <div class="sm:col-span-2 font-mono text-xs text-[var(--color-muted)]">{{ n.driver }}</div>
          <div class="sm:col-span-2 text-xs text-[var(--color-muted)]">{{ n.scope }}</div>
          <div class="sm:col-span-3 font-mono text-xs text-[var(--color-faint)]">{{ n.subnet || '—' }}</div>
          <div class="col-span-2 sm:col-span-1 flex justify-end">
            <UButton v-if="can('operator') && !SYSTEM.includes(n.name)" icon="i-lucide-trash-2" color="error" variant="ghost" size="sm" @click="remove(n)" />
          </div>
        </div>
      </div>
    </DataState>

    <UModal v-model:open="open" title="Create network">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Name" required><UInput v-model="form.name" class="w-full font-mono" placeholder="app-net" /></UFormField>
          <UFormField label="Driver"><USelect v-model="form.driver" :items="['overlay', 'bridge', 'macvlan']" class="w-full" /></UFormField>
          <UFormField label="Subnet" hint="optional, e.g. 10.0.9.0/24"><UInput v-model="form.subnet" class="w-full font-mono" placeholder="10.0.9.0/24" /></UFormField>
          <div class="flex gap-6">
            <UCheckbox v-model="form.attachable" label="Attachable" />
            <UCheckbox v-model="form.internal" label="Internal" />
          </div>
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
