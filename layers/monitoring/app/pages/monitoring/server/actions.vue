<script setup lang="ts">
// Zabbix Actions: when a problem >= min severity opens, notify a channel. Uses
// the portal's shared alert channels (Telegram / Teams / Webhook).
const { hasApp, hasPermission } = useAuth()
const toast = useToast()
const canManage = computed(() => hasPermission('monitoring.manage'))

const { data: actions, status, refresh } = useAsyncData('serverActions', () => $fetch<any[]>('/api/server/actions'), { default: () => [], server: false })
const { data: channels } = useAsyncData('serverActionChannels', () => $fetch<any[]>('/api/alerts/channels'), { default: () => [] })

const channelItems = computed(() => [{ value: '', label: '— No channel —' }, ...(channels.value || []).map((c: any) => ({ value: c.id, label: `${c.name} (${c.type})` }))])
const statusItems = [{ value: 'enabled', label: 'Enabled' }, { value: 'disabled', label: 'Disabled' }]

const open = ref(false)
const editing = ref<any>(null)
const saving = ref(false)
const form = reactive<any>({ name: '', min_severity: 2, channel_id: '', status: 'enabled' })

function openCreate() { editing.value = null; Object.assign(form, { name: '', min_severity: 2, channel_id: '', status: 'enabled' }); open.value = true }
function openEdit(a: any) { editing.value = a; Object.assign(form, { name: a.name, min_severity: Number(a.min_severity), channel_id: a.channel_id || '', status: a.status }); open.value = true }
async function save() {
  if (!form.name.trim()) { toast.add({ title: 'Name is required', color: 'error' }); return }
  saving.value = true
  try {
    const body = { ...form, channel_id: form.channel_id || null }
    if (editing.value) await $fetch(`/api/server/actions/${editing.value.id}`, { method: 'PUT', body })
    else await $fetch('/api/server/actions', { method: 'POST', body })
    toast.add({ title: editing.value ? 'Updated' : 'Created', color: 'primary', icon: 'i-lucide-check' })
    open.value = false; await refresh()
  } catch (e: any) { toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' }) }
  finally { saving.value = false }
}
async function del(a: any) { if (!confirm(`Delete action "${a.name}"?`)) return; await $fetch(`/api/server/actions/${a.id}`, { method: 'DELETE' }); await refresh() }
</script>

<template>
  <div>
    <PageHeader title="Actions" subtitle="Notify a channel when problems fire" icon="i-lucide-bell-ring">
      <template v-if="hasApp('monitoring') && canManage" #actions>
        <UButton icon="i-lucide-plus" size="sm" @click="openCreate">Create action</UButton>
      </template>
    </PageHeader>

    <div v-if="!hasApp('monitoring')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-Monitoring.</p>
    </div>

    <template v-else>
      <div v-if="!channels?.length" class="panel p-4 mb-4 text-sm text-(--color-muted) flex items-center gap-2">
        <UIcon name="i-lucide-info" class="size-4 text-beacon" />
        No notification channels configured yet. Add Telegram / Teams / Webhook channels under the portal alert settings, then pick them here.
      </div>
      <div class="panel">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm text-(--color-muted)">
            <thead class="bg-surface-2 text-xs uppercase text-faint border-b border-surface">
              <tr><th class="px-4 py-3 font-medium">Name</th><th class="px-4 py-3 font-medium">Fires at</th><th class="px-4 py-3 font-medium">Channel</th><th class="px-4 py-3 font-medium">Status</th><th class="px-4 py-3 font-medium text-right">Actions</th></tr>
            </thead>
            <tbody class="divide-y divide-surface">
              <tr v-if="status === 'pending' && !actions.length"><td colspan="5" class="px-4 py-8 text-center text-faint">Loading…</td></tr>
              <tr v-else-if="!actions.length"><td colspan="5" class="px-4 py-8 text-center text-faint">No actions.</td></tr>
              <tr v-for="a in actions" :key="a.id" class="hover:bg-surface-2/50 transition">
                <td class="px-4 py-3 font-medium text-foam">{{ a.name }}</td>
                <td class="px-4 py-3"><span class="px-2 py-0.5 rounded text-xs" :class="severityMeta(a.min_severity).badge">≥ {{ severityMeta(a.min_severity).label }}</span></td>
                <td class="px-4 py-3">{{ a.channel_name ? `${a.channel_name} (${a.channel_type})` : '—' }}</td>
                <td class="px-4 py-3"><UBadge :color="a.status === 'enabled' ? 'success' : 'neutral'" variant="subtle" size="xs">{{ a.status }}</UBadge></td>
                <td class="px-4 py-3 text-right">
                  <div v-if="canManage" class="flex justify-end gap-1">
                    <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-pencil" aria-label="Edit" @click="openEdit(a)" />
                    <UButton size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" aria-label="Delete" @click="del(a)" />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <UModal v-model:open="open" :title="editing ? 'Edit action' : 'Create action'">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Name" required><UInput v-model="form.name" class="w-full" placeholder="Notify on-call" /></UFormField>
          <UFormField label="Minimum severity"><USelect v-model="form.min_severity" :items="SEVERITY_SELECT_ITEMS" value-key="value" label-key="label" class="w-full" /></UFormField>
          <UFormField label="Channel"><USelect v-model="form.channel_id" :items="channelItems" value-key="value" label-key="label" class="w-full" /></UFormField>
          <UFormField label="Status"><USelect v-model="form.status" :items="statusItems" value-key="value" label-key="label" class="w-full" /></UFormField>
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
