<script setup lang="ts">
const toast = useToast()
const { data, status, error, refresh } = await useFetch('/api/registries', { lazy: true })

const open = ref(false)
const form = reactive({ name: '', url: '', username: '', password: '' })
function openCreate() { Object.assign(form, { name: '', url: '', username: '', password: '' }); open.value = true }
async function create() {
  if (!form.name || !form.url) { toast.add({ title: 'Name and URL required', color: 'warning' }); return }
  try {
    await $fetch('/api/registries', { method: 'POST', body: { ...form } })
    toast.add({ title: `Added ${form.name}`, color: 'primary', icon: 'i-lucide-container' })
    open.value = false
    setTimeout(refresh, 500)
  } catch (e: any) { toast.add({ title: 'Add failed', description: e?.data?.statusMessage, color: 'error' }) }
}
async function remove(r: any) {
  if (!confirm(`Remove registry "${r.name}"?`)) return
  try {
    await $fetch(`/api/registries/${r.id}`, { method: 'DELETE' })
    toast.add({ title: `Removed ${r.name}`, color: 'primary' })
    refresh()
  } catch (e: any) { toast.add({ title: 'Remove failed', description: e?.data?.statusMessage, color: 'error' }) }
}
</script>

<template>
  <div>
    <PageHeader title="Registries" subtitle="Private image registry credentials" icon="i-lucide-container">
      <template #actions>
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" @click="refresh()" />
        <UButton icon="i-lucide-plus" color="primary" label="Add registry" @click="openCreate" />
      </template>
    </PageHeader>

    <DataState :status="status" :error="error" :empty="!data?.length" empty-label="No registries configured." empty-icon="i-lucide-container">
      <div class="space-y-2">
        <div v-for="r in data" :key="r.id" class="panel-flush p-3.5 flex items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="truncate font-medium text-[var(--color-foam)]">{{ r.name }}</p>
            <p class="truncate font-mono text-xs text-[var(--color-faint)]">{{ r.url }} · {{ r.username }}</p>
          </div>
          <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="sm" @click="remove(r)" />
        </div>
      </div>
    </DataState>

    <UModal v-model:open="open" title="Add registry">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Name" required><UInput v-model="form.name" class="w-full" placeholder="Docker Hub" /></UFormField>
          <UFormField label="URL" required><UInput v-model="form.url" class="w-full font-mono" placeholder="https://index.docker.io/v1/" /></UFormField>
          <UFormField label="Username"><UInput v-model="form.username" class="w-full" /></UFormField>
          <UFormField label="Password / token"><UInput v-model="form.password" type="password" class="w-full" /></UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" label="Cancel" @click="open = false" />
          <UButton color="primary" label="Add" icon="i-lucide-check" @click="create" />
        </div>
      </template>
    </UModal>
  </div>
</template>
