<script setup lang="ts">
// Zabbix Maintenance windows: while active, matching hosts' new problems are
// suppressed (the poller sets problem.suppressed and skips notifications).
const { hasApp, hasPermission } = useAuth()
const toast = useToast()
const canManage = computed(() => hasPermission('monitoring.manage'))

const { data: windows, status, refresh } = useAsyncData('serverMaintenance', () => $fetch<any[]>('/api/server/maintenance'), { default: () => [], server: false })
const { data: hosts } = useAsyncData('serverMaintHosts', () => $fetch<any[]>('/api/server/hosts'), { default: () => [] })
const { data: groups } = useAsyncData('serverMaintGroups', () => $fetch<any[]>('/api/server/hostgroups'), { default: () => [] })
onMounted(() => { const t = setInterval(() => { if (!document.hidden) refresh() }, 30000); onUnmounted(() => clearInterval(t)) })

const hostItems = computed(() => (hosts.value || []).map((h) => ({ value: h.id, label: h.name })))
const groupItems = computed(() => (groups.value || []).map((g) => ({ value: g.id, label: g.name })))

function toLocal(iso: string) { const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}` }

const open = ref(false)
const editing = ref<any>(null)
const saving = ref(false)
const form = reactive<any>({ name: '', active_since: '', active_till: '', host_ids: [], group_ids: [], description: '' })

function openCreate() {
  editing.value = null
  const now = new Date(); const later = new Date(Date.now() + 3600_000)
  Object.assign(form, { name: '', active_since: toLocal(now.toISOString()), active_till: toLocal(later.toISOString()), host_ids: [], group_ids: [], description: '' })
  open.value = true
}
function openEdit(m: any) {
  editing.value = m
  Object.assign(form, { name: m.name, active_since: toLocal(m.active_since), active_till: toLocal(m.active_till), host_ids: m.host_ids || [], group_ids: m.group_ids || [], description: m.description || '' })
  open.value = true
}
async function save() {
  if (!form.name.trim() || !form.active_since || !form.active_till) { toast.add({ title: 'Name, start and end are required', color: 'error' }); return }
  saving.value = true
  try {
    if (editing.value) await $fetch(`/api/server/maintenance/${editing.value.id}`, { method: 'PUT', body: { ...form } })
    else await $fetch('/api/server/maintenance', { method: 'POST', body: { ...form } })
    toast.add({ title: editing.value ? 'Updated' : 'Created', color: 'primary', icon: 'i-lucide-check' })
    open.value = false; await refresh()
  } catch (e: any) { toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' }) }
  finally { saving.value = false }
}
async function del(m: any) { if (!confirm(`Delete "${m.name}"?`)) return; await $fetch(`/api/server/maintenance/${m.id}`, { method: 'DELETE' }); await refresh() }
</script>

<template>
  <div>
    <PageHeader title="Maintenance" subtitle="Suppress problems during planned windows" icon="i-lucide-wrench">
      <template v-if="hasApp('monitoring') && canManage" #actions>
        <UButton icon="i-lucide-plus" size="sm" @click="openCreate">Create window</UButton>
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
            <tr><th class="px-4 py-3 font-medium">Name</th><th class="px-4 py-3 font-medium">Period</th><th class="px-4 py-3 font-medium">Scope</th><th class="px-4 py-3 font-medium">State</th><th class="px-4 py-3 font-medium text-right">Actions</th></tr>
          </thead>
          <tbody class="divide-y divide-surface">
            <tr v-if="status === 'pending' && !windows.length"><td colspan="5" class="px-4 py-8 text-center text-faint">Loading…</td></tr>
            <tr v-else-if="!windows.length"><td colspan="5" class="px-4 py-8 text-center text-faint">No maintenance windows.</td></tr>
            <tr v-for="m in windows" :key="m.id" class="hover:bg-surface-2/50 transition">
              <td class="px-4 py-3 font-medium text-foam">{{ m.name }}</td>
              <td class="px-4 py-3 text-xs">{{ new Date(m.active_since).toLocaleString() }} → {{ new Date(m.active_till).toLocaleString() }}</td>
              <td class="px-4 py-3 text-xs">{{ m.host_ids.length }} hosts · {{ m.group_ids.length }} groups</td>
              <td class="px-4 py-3"><UBadge :color="m.active ? 'warning' : 'neutral'" variant="subtle" size="xs">{{ m.active ? 'Active' : 'Scheduled' }}</UBadge></td>
              <td class="px-4 py-3 text-right">
                <div v-if="canManage" class="flex justify-end gap-1">
                  <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-pencil" aria-label="Edit" @click="openEdit(m)" />
                  <UButton size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" aria-label="Delete" @click="del(m)" />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <UModal v-model:open="open" :title="editing ? 'Edit maintenance' : 'Create maintenance'">
      <template #body>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Name" required class="sm:col-span-2"><UInput v-model="form.name" class="w-full" /></UFormField>
          <UFormField label="Active since" required><UInput v-model="form.active_since" type="datetime-local" class="w-full" /></UFormField>
          <UFormField label="Active till" required><UInput v-model="form.active_till" type="datetime-local" class="w-full" /></UFormField>
          <UFormField label="Hosts" class="sm:col-span-2"><USelectMenu v-model="form.host_ids" :items="hostItems" value-key="value" label-key="label" multiple class="w-full" placeholder="Select hosts" /></UFormField>
          <UFormField label="Groups" class="sm:col-span-2"><USelectMenu v-model="form.group_ids" :items="groupItems" value-key="value" label-key="label" multiple class="w-full" placeholder="Select groups" /></UFormField>
          <UFormField label="Description" class="sm:col-span-2"><UTextarea v-model="form.description" class="w-full" :rows="2" /></UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="open = false">Cancel</UButton>
          <UButton color="primary" :loading="saving" @click="save">{{ editing ? 'Save' : 'Create' }}</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
