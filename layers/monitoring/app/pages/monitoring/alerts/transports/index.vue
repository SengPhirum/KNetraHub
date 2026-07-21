<script setup lang="ts">
// Alert transports — full CRUD (admin) + Test (operator). Config is stored
// encrypted server-side and never returned; editing without touching the
// config fields keeps the stored secrets.
const { hasMonitoring, canOperate, canManage } = useMonitoring()
const toast = useToast()
const { data, status, refresh } = useAsyncData('monTransports',
  () => $fetch<any>('/api/monitoring/v1/alerts/transports'),
  { server: false, default: () => ({ items: [] }) })

interface ConfigField { key: string; label: string; type?: 'text' | 'password' | 'number'; placeholder?: string; required?: boolean }
const CONFIG_FIELDS: Record<string, ConfigField[]> = {
  webhook: [{ key: 'url', label: 'Webhook URL', placeholder: 'https://example.com/hook', required: true }],
  slack: [{ key: 'webhook_url', label: 'Incoming webhook URL', required: true }],
  discord: [{ key: 'webhook_url', label: 'Webhook URL', required: true }],
  teams: [{ key: 'webhook_url', label: 'Incoming webhook URL', required: true }],
  mattermost: [{ key: 'webhook_url', label: 'Incoming webhook URL', required: true }],
  rocketchat: [{ key: 'webhook_url', label: 'Incoming webhook URL', required: true }],
  telegram: [
    { key: 'bot_token', label: 'Bot token', type: 'password', required: true },
    { key: 'chat_id', label: 'Chat ID', required: true }
  ],
  gotify: [
    { key: 'server_url', label: 'Server URL', placeholder: 'https://gotify.example.com', required: true },
    { key: 'app_token', label: 'App token', type: 'password', required: true }
  ],
  ntfy: [
    { key: 'server_url', label: 'Server URL', placeholder: 'https://ntfy.sh' },
    { key: 'topic', label: 'Topic', required: true }
  ],
  pushover: [
    { key: 'api_token', label: 'API token', type: 'password', required: true },
    { key: 'user_key', label: 'User key', type: 'password', required: true }
  ],
  pagerduty: [{ key: 'routing_key', label: 'Integration routing key', type: 'password', required: true }],
  opsgenie: [{ key: 'api_key', label: 'API key', type: 'password', required: true }],
  smtp: [
    { key: 'host', label: 'SMTP host', required: true },
    { key: 'port', label: 'Port', type: 'number', placeholder: '587' },
    { key: 'username', label: 'Username' },
    { key: 'password', label: 'Password', type: 'password' },
    { key: 'from', label: 'From address', placeholder: 'monitor@example.com', required: true },
    { key: 'to', label: 'To (comma-separated)', placeholder: 'noc@example.com', required: true }
  ]
}
const typeItems = Object.keys(CONFIG_FIELDS).map((t) => ({ value: t, label: t }))

const form = reactive({
  name: '', type: 'webhook', enabled: true, is_default: false,
  config: {} as Record<string, any>, touchedConfig: false
})
const editingId = ref<number | null>(null)
const modalOpen = ref(false)
const saving = ref(false)

// Changing type on create resets the config fields; when editing, the type
// select is disabled and this must not clobber the keep-stored-config state.
watch(() => form.type, () => {
  if (!editingId.value) {
    form.config = {}
    form.touchedConfig = true
  }
})

function openCreate() {
  editingId.value = null
  Object.assign(form, { name: '', type: 'webhook', enabled: true, is_default: false, config: {}, touchedConfig: true })
  modalOpen.value = true
}
function openEdit(t: any) {
  editingId.value = t.id
  Object.assign(form, { name: t.name, type: t.type, enabled: !!t.enabled, is_default: !!t.is_default, config: {}, touchedConfig: false })
  modalOpen.value = true
}

const configComplete = computed(() => {
  if (editingId.value && !form.touchedConfig) return true // keeping stored config
  return (CONFIG_FIELDS[form.type] ?? []).every((f) => !f.required || String(form.config[f.key] ?? '').trim())
})

function markTouched() {
  form.touchedConfig = true
}

async function save() {
  saving.value = true
  try {
    const body: any = { name: form.name, type: form.type, enabled: form.enabled, is_default: form.is_default }
    if (!editingId.value || form.touchedConfig) body.config = { ...form.config }
    if (editingId.value) {
      await $fetch(`/api/monitoring/v1/alerts/transports/${editingId.value}`, { method: 'PUT', body })
      toast.add({ title: 'Transport updated', color: 'primary', icon: 'i-lucide-check' })
    } else {
      await $fetch('/api/monitoring/v1/alerts/transports', { method: 'POST', body })
      toast.add({ title: 'Transport created', color: 'primary', icon: 'i-lucide-check' })
    }
    modalOpen.value = false
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' })
  } finally { saving.value = false }
}

const deleteTarget = ref<any>(null)
async function confirmDelete(headers: Record<string, string>) {
  if (!deleteTarget.value) return
  await $fetch(`/api/monitoring/v1/alerts/transports/${deleteTarget.value.id}`, { method: 'DELETE', headers })
  toast.add({ title: 'Transport deleted', color: 'primary', icon: 'i-lucide-check' })
  deleteTarget.value = null
  await refresh()
}

const testing = ref<number | null>(null)
async function test(id: number) {
  testing.value = id
  try {
    const res = await $fetch<any>(`/api/monitoring/v1/alerts/transports/${id}/test`, { method: 'POST' })
    toast.add({ title: res.ok ? 'Test sent' : 'Test failed', description: res.error, color: res.ok ? 'primary' : 'error', icon: res.ok ? 'i-lucide-check' : 'i-lucide-x' })
  } catch (e: any) {
    toast.add({ title: 'Test failed', description: e?.data?.statusMessage, color: 'error' })
  } finally { testing.value = null }
}
</script>

<template>
  <div>
    <PageHeader title="Alert Transports" subtitle="Notification delivery channels" icon="i-lucide-send">
      <template v-if="hasMonitoring && canManage" #actions>
        <UButton icon="i-lucide-plus" size="sm" @click="openCreate">Add transport</UButton>
      </template>
    </PageHeader>
    <div v-if="!hasMonitoring" class="panel p-10 text-center text-muted">No access.</div>
    <div v-else class="space-y-4">
      <!-- Pre-configured (Global) channels an admin set up in Admin ▸ Notifications.
           Opting one in here delivers every Monitoring alert to it, alongside the
           native transports below. Managing the opt-in is a manager action. -->
      <AppNotifications v-if="canManage" scope="monitoring" shared-only />

      <div class="panel overflow-x-auto">
        <div class="border-b border-hull px-3 py-2">
          <p class="text-xs font-semibold uppercase tracking-wider text-faint">This app’s transports</p>
        </div>
      <table class="w-full text-sm">
        <thead class="bg-surface-2 text-left text-xs uppercase text-faint">
          <tr><th class="px-3 py-2">Name</th><th class="px-3 py-2">Type</th><th class="px-3 py-2">Enabled</th>
            <th class="px-3 py-2">Default</th><th class="px-3 py-2 text-right" /></tr>
        </thead>
        <tbody>
          <tr v-if="status === 'pending'"><td colspan="5" class="px-3 py-8 text-center text-muted">Loading…</td></tr>
          <tr v-else-if="!data.items.length"><td colspan="5" class="px-3 py-8 text-center text-muted">No transports configured — alerts stay in-app only.</td></tr>
          <tr v-for="t in data.items" :key="t.id" class="border-t border-hull">
            <td class="px-3 py-2">{{ t.name }}</td>
            <td class="px-3 py-2 text-muted">{{ t.type }}</td>
            <td class="px-3 py-2">{{ t.enabled ? 'Yes' : 'No' }}</td>
            <td class="px-3 py-2">{{ t.is_default ? 'Yes' : '—' }}</td>
            <td class="px-3 py-2 text-right whitespace-nowrap">
              <UButton v-if="canOperate" size="xs" variant="soft" :loading="testing === t.id" @click="test(t.id)">Test</UButton>
              <template v-if="canManage">
                <UButton size="xs" variant="ghost" icon="i-lucide-pencil" @click="openEdit(t)" />
                <UButton size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" @click="deleteTarget = t" />
              </template>
            </td>
          </tr>
        </tbody>
      </table>
      </div>
    </div>

    <UModal v-model:open="modalOpen" :title="editingId ? 'Edit transport' : 'Add transport'">
      <template #body>
        <div class="space-y-3">
          <UFormField label="Name" required><UInput v-model="form.name" placeholder="NOC Slack" class="w-full" /></UFormField>
          <UFormField label="Type"><USelect v-model="form.type" :items="typeItems" class="w-full" :disabled="!!editingId" /></UFormField>
          <p v-if="editingId && !form.touchedConfig" class="text-xs text-faint">
            Stored configuration is kept unless you edit a field below.
          </p>
          <UFormField v-for="f in CONFIG_FIELDS[form.type]" :key="f.key" :label="f.label" :required="f.required">
            <UInput v-model="form.config[f.key]" :type="f.type ?? 'text'"
              :placeholder="editingId && !form.touchedConfig ? '•••••• (unchanged)' : f.placeholder" class="w-full"
              @update:model-value="markTouched" />
          </UFormField>
          <div class="flex items-center gap-6">
            <UCheckbox v-model="form.enabled" label="Enabled" />
            <UCheckbox v-model="form.is_default" label="Default (used by rules with no explicit transports)" />
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" @click="modalOpen = false">Cancel</UButton>
          <UButton :loading="saving" :disabled="!form.name || !configComplete" @click="save">{{ editingId ? 'Save' : 'Add transport' }}</UButton>
        </div>
      </template>
    </UModal>

    <ConfirmDeleteModal
      type="monitoring.alert-transport"
      :item-name="deleteTarget?.name"
      :open="!!deleteTarget"
      @update:open="(v: boolean) => { if (!v) deleteTarget = null }"
      title="Delete transport"
      :message="deleteTarget ? `Transport ${deleteTarget.name} will be deleted. Rules using it keep working but stop delivering through this channel.` : ''"
      :action="confirmDelete"
    />
  </div>
</template>
