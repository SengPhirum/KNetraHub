<script setup lang="ts">
// Alert transports — full CRUD (admin) + Test (operator). Config is stored
// encrypted server-side and never returned; editing without touching the
// config fields keeps the stored secrets. Monitoring keeps its own per-rule
// routing engine (a transport can be routed to specific rules, or marked
// Default); the UI is styled to match the Dock/IP-Mgt Alert Transports pages
// (shared channel-type icons/labels, card rows), and the shared Global-channel
// picker is embedded above so Monitoring can also opt into admin channels.
import { CHANNEL_TYPE_META, channelTypeLabel, type NotificationChannelType } from '~~/shared/utils/notifications'

const { hasMonitoring, canOperate, canManage } = useMonitoring()
const toast = useToast()

// Monitoring's 'smtp' transport maps to the shared library's 'email' visuals;
// every other type shares the central icon/label so the look matches Dock.
function typeIcon(t: string): string {
  if (t === 'smtp') return 'i-lucide-mail'
  return CHANNEL_TYPE_META[t as NotificationChannelType]?.icon || 'i-lucide-bell'
}
function typeLabel(t: string): string {
  if (t === 'smtp') return 'Email (SMTP)'
  return channelTypeLabel(t as NotificationChannelType)
}
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
const typeItems = Object.keys(CONFIG_FIELDS).map((t) => ({ value: t, label: typeLabel(t) }))

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
    <PageHeader title="Alert Transports" subtitle="Where Monitoring alerts are delivered — this app's transports and shared portal channels" icon="i-lucide-send">
      <template v-if="hasMonitoring" #actions>
        <div class="flex gap-2">
          <UButton size="sm" variant="soft" icon="i-lucide-bell-ring" label="Alert Rules" to="/monitoring/alerts/rules" />
          <UButton size="sm" color="neutral" variant="soft" icon="i-lucide-arrow-left" label="Back to Overview" to="/monitoring" />
        </div>
      </template>
    </PageHeader>
    <div v-if="!hasMonitoring" class="panel p-10 text-center text-muted">No access.</div>
    <div v-else class="max-w-5xl space-y-4">
      <!-- Pre-configured (Global) channels an admin set up in Admin ▸ Notifications.
           Opting one in here delivers every Monitoring alert to it, alongside the
           native transports below. Managing the opt-in is a manager action. -->
      <AppNotifications v-if="canManage" scope="monitoring" shared-only />

      <!-- This app's own transports — same card styling as the Dock/IP-Mgt
           Alert Transports pages, but backed by Monitoring's per-rule routing
           engine (the Default badge + routing note preserve that semantic). -->
      <section class="panel space-y-4 p-5">
        <div>
          <div class="mb-2 flex items-center justify-between">
            <p class="text-xs font-semibold uppercase tracking-wider text-(--color-muted)">This app’s transports</p>
            <UButton v-if="canManage" icon="i-lucide-plus" color="primary" variant="soft" size="xs" label="Add transport" @click="openCreate" />
          </div>

          <div v-if="status === 'pending'" class="py-8 text-center text-sm text-muted">Loading…</div>
          <div v-else-if="!data.items.length" class="rounded-lg bg-surface-2/30 px-3 py-6 text-center text-xs text-faint ring-1 ring-hull-soft">
            No transports yet — add one, or turn on a shared channel above.
          </div>
          <div v-else class="divide-y divide-hull">
            <div v-for="t in data.items" :key="t.id" class="flex flex-wrap items-center justify-between gap-3 py-3">
              <div class="flex min-w-0 items-center gap-3">
                <UIcon :name="typeIcon(t.type)" class="size-4 shrink-0 text-beacon" />
                <div class="min-w-0">
                  <p class="truncate text-sm text-foam">{{ t.name }}</p>
                  <p class="text-xs text-faint">{{ typeLabel(t.type) }}</p>
                </div>
                <UBadge :color="t.enabled ? 'primary' : 'neutral'" variant="subtle" :label="t.enabled ? 'Enabled' : 'Disabled'" />
                <UBadge v-if="t.is_default" color="neutral" variant="subtle" icon="i-lucide-star" label="Default" />
              </div>
              <div class="flex items-center gap-1">
                <UButton v-if="canOperate" size="xs" color="neutral" variant="soft" icon="i-lucide-send" label="Test" :loading="testing === t.id" @click="test(t.id)" />
                <template v-if="canManage">
                  <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-pencil" aria-label="Edit" @click="openEdit(t)" />
                  <UButton size="xs" color="error" variant="ghost" icon="i-lucide-trash-2" aria-label="Delete" @click="deleteTarget = t" />
                </template>
              </div>
            </div>
          </div>
        </div>
        <p class="border-t border-hull pt-3 text-xs text-faint">
          Alert rules route to specific transports (set per rule under Alert Rules); a <span class="text-foam">Default</span> transport receives alerts from any rule with no explicit routing.
        </p>
      </section>
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
              class="w-full"
              :class="(f.type ?? 'text') === 'text' && (f.key.includes('url') || f.key === 'to' || f.key === 'host') ? 'font-mono' : ''"
              autocomplete="off"
              :placeholder="editingId && !form.touchedConfig ? '•••••• (unchanged)' : f.placeholder"
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
