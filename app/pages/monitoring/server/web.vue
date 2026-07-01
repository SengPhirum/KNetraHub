<script setup lang="ts">
// Zabbix Web monitoring: HTTP scenarios polled for status + latency.
const { hasApp, hasPermission } = useAuth()
const toast = useToast()
const canManage = computed(() => hasPermission('monitoring.manage'))

const { data: scenarios, status, refresh } = useAsyncData('serverWeb', () => $fetch<any[]>('/api/server/web'), { default: () => [], server: false })
const { data: hosts } = useAsyncData('serverWebHosts', () => $fetch<any[]>('/api/server/hosts'), { default: () => [] })
onMounted(() => { const t = setInterval(refresh, 15000); onUnmounted(() => clearInterval(t)) })

const hostItems = computed(() => [{ value: '', label: '— None —' }, ...(hosts.value || []).map((h) => ({ value: h.id, label: h.name }))])

const open = ref(false)
const saving = ref(false)
const form = reactive<any>({ name: '', url: '', expected_status: 200, interval: 60, host_id: '' })
function openCreate() { Object.assign(form, { name: '', url: '', expected_status: 200, interval: 60, host_id: '' }); open.value = true }
async function save() {
  if (!form.name.trim() || !form.url.trim()) { toast.add({ title: 'Name and URL are required', color: 'error' }); return }
  saving.value = true
  try {
    await $fetch('/api/server/web', { method: 'POST', body: { ...form, host_id: form.host_id || null } })
    toast.add({ title: 'Scenario created', color: 'primary', icon: 'i-lucide-check' })
    open.value = false; await refresh()
  } catch (e: any) { toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' }) }
  finally { saving.value = false }
}
async function del(w: any) { if (!confirm(`Delete "${w.name}"?`)) return; await $fetch(`/api/server/web/${w.id}`, { method: 'DELETE' }); await refresh() }
</script>

<template>
  <div>
    <PageHeader title="Web monitoring" subtitle="HTTP scenarios checked for availability + latency" icon="i-lucide-globe">
      <template v-if="hasApp('monitoring') && canManage" #actions>
        <UButton icon="i-lucide-plus" size="sm" @click="openCreate">Create scenario</UButton>
      </template>
    </PageHeader>

    <div v-if="!hasApp('monitoring')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-Monitoring.</p>
    </div>

    <div v-else class="panel">
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm text-(--color-muted)">
          <thead class="bg-surface-2 text-xs uppercase text-faint border-b border-surface">
            <tr><th class="px-4 py-3 font-medium">Status</th><th class="px-4 py-3 font-medium">Name</th><th class="px-4 py-3 font-medium">URL</th><th class="px-4 py-3 font-medium">Code</th><th class="px-4 py-3 font-medium">Latency</th><th class="px-4 py-3 font-medium">Checked</th><th class="px-4 py-3 font-medium text-right">Actions</th></tr>
          </thead>
          <tbody class="divide-y divide-surface">
            <tr v-if="status === 'pending' && !scenarios.length"><td colspan="7" class="px-4 py-8 text-center text-faint">Loading…</td></tr>
            <tr v-else-if="!scenarios.length"><td colspan="7" class="px-4 py-8 text-center text-faint">No web scenarios.</td></tr>
            <tr v-for="w in scenarios" :key="w.id" class="hover:bg-surface-2/50 transition">
              <td class="px-4 py-3"><UBadge :color="w.last_status === 'up' ? 'success' : w.last_status === 'down' ? 'error' : 'neutral'" variant="subtle" size="xs">{{ w.last_status || 'pending' }}</UBadge></td>
              <td class="px-4 py-3 font-medium text-foam">{{ w.name }}</td>
              <td class="px-4 py-3 font-mono text-xs truncate max-w-xs" :title="w.url">{{ w.url }}</td>
              <td class="px-4 py-3">{{ w.last_code ?? '—' }}</td>
              <td class="px-4 py-3">{{ w.last_ms != null ? Math.round(w.last_ms) + ' ms' : '—' }}</td>
              <td class="px-4 py-3 text-xs">{{ w.last_check ? new Date(w.last_check).toLocaleTimeString() : '—' }}</td>
              <td class="px-4 py-3 text-right"><UButton v-if="canManage" size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" aria-label="Delete" @click="del(w)" /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <UModal v-model:open="open" title="Create web scenario">
      <template #body>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Name" required class="sm:col-span-2"><UInput v-model="form.name" class="w-full" placeholder="Homepage" /></UFormField>
          <UFormField label="URL" required class="sm:col-span-2"><UInput v-model="form.url" class="w-full" placeholder="https://example.com" /></UFormField>
          <UFormField label="Expected status"><UInput v-model.number="form.expected_status" type="number" class="w-full" /></UFormField>
          <UFormField label="Host (optional)"><USelect v-model="form.host_id" :items="hostItems" value-key="value" label-key="label" class="w-full" /></UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="open = false">Cancel</UButton>
          <UButton color="primary" :loading="saving" @click="save">Create</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
