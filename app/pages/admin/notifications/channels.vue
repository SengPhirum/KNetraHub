<script setup lang="ts">
import {
  NOTIFICATION_CHANNEL_TYPES, CHANNEL_TYPE_META, channelTypeLabel, scopeLabel,
  type NotificationChannelType
} from '~~/shared/utils/notifications'

// Admin ▸ Notifications ▸ Channels — the central channel library. Every sub-app
// reads from here; a channel is Global (shared) or owned by one app. Config is
// write-only (never returned), so edits use the "leave blank to keep" rule.
definePageMeta({ middleware: 'admin' })

const toast = useToast()
const { data, status, error, refresh, refreshing } = useApiCache('notification-channels', () => $fetch<any[]>('/api/notifications/channels'))
onMounted(refresh)

const APPS = getModuleRegistry()
const scopeOptions = computed(() => [
  { label: 'Global (all apps)', value: 'global' },
  ...APPS.map((a) => ({ label: `${a.name} only`, value: a.key }))
])
const typeOptions = NOTIFICATION_CHANNEL_TYPES.map((t) => ({ label: CHANNEL_TYPE_META[t].label, value: t }))

const modalOpen = ref(false)
const editingId = ref<string | null>(null)
const form = reactive({ name: '', type: 'email' as NotificationChannelType, scope: 'global', enabled: true, config: {} as Record<string, string> })
const saving = ref(false)

const typeMeta = computed(() => CHANNEL_TYPE_META[form.type])

function blankConfig(type: NotificationChannelType): Record<string, string> {
  return Object.fromEntries(CHANNEL_TYPE_META[type].fields.map((f) => [f.key, '']))
}
watch(() => form.type, (t) => { if (!editingId.value) form.config = blankConfig(t) })

function openCreate() {
  editingId.value = null
  Object.assign(form, { name: '', type: 'email', scope: 'global', enabled: true, config: blankConfig('email') })
  modalOpen.value = true
}
function openEdit(c: any) {
  editingId.value = c.id
  Object.assign(form, { name: c.name, type: c.type, scope: c.scope, enabled: c.enabled, config: blankConfig(c.type) })
  modalOpen.value = true
}

async function save() {
  if (!form.name.trim()) { toast.add({ title: 'Give the channel a name', color: 'warning' }); return }
  saving.value = true
  try {
    // Only send config fields the user actually filled (blank = keep on edit).
    const config: Record<string, string> = {}
    for (const [k, v] of Object.entries(form.config)) if (String(v).trim() !== '') config[k] = v
    if (editingId.value) {
      await $fetch(`/api/notifications/channels/${editingId.value}`, { method: 'PATCH', body: { name: form.name, scope: form.scope, enabled: form.enabled, config } })
      toast.add({ title: `Updated ${form.name}`, color: 'primary', icon: 'i-lucide-check' })
    } else {
      await $fetch('/api/notifications/channels', { method: 'POST', body: { name: form.name, type: form.type, scope: form.scope, enabled: form.enabled, config } })
      toast.add({ title: `Created ${form.name}`, color: 'primary', icon: 'i-lucide-check' })
    }
    modalOpen.value = false
    await refresh()
  } catch (e: any) { toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' }) }
  finally { saving.value = false }
}

const testingId = ref<string | null>(null)
async function testChannel(c: any) {
  testingId.value = c.id
  try {
    const res = await $fetch<{ ok: boolean; target: string; error?: string }>(`/api/notifications/channels/${c.id}/test`, { method: 'POST' })
    if (res.ok) toast.add({ title: 'Test delivered', description: res.target, color: 'primary', icon: 'i-lucide-send' })
    else toast.add({ title: 'Test failed', description: res.error || res.target, color: 'error' })
  } catch (e: any) { toast.add({ title: 'Test failed', description: e?.data?.statusMessage, color: 'error' }) }
  finally { testingId.value = null }
}

const deleteTarget = ref<any>(null)
async function confirmDelete(headers: Record<string, string>) {
  const c = deleteTarget.value
  if (!c) return
  await $fetch(`/api/notifications/channels/${c.id}`, { method: 'DELETE', headers })
  toast.add({ title: `Deleted ${c.name}`, color: 'primary' })
  data.value = (data.value ?? []).filter((x) => x.id !== c.id)
  deleteTarget.value = null
}
</script>

<template>
  <div>
    <PageHeader title="Notification channels" subtitle="One shared library of delivery destinations for every app" icon="i-lucide-satellite-dish">
      <template #actions>
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" :loading="refreshing" @click="refresh()" />
        <UButton icon="i-lucide-plus" color="primary" label="Add channel" @click="openCreate" />
      </template>
    </PageHeader>

    <div class="notice-info panel-flush mb-5 flex items-start gap-2 p-3 text-xs">
      <UIcon name="i-lucide-info" class="mt-0.5 size-4 shrink-0" />
      <span>
        Channels are configured once here and reused across apps. A <b>Global</b> channel is available everywhere;
        an app-scoped one is tagged with that app’s name. <b>Email</b> channels send through the portal SMTP server
        set in <NuxtLink to="/admin/configuration/email" class="text-beacon hover:underline">Configuration ▸ Email</NuxtLink> —
        only recipients and the sender name are set per channel.
      </span>
    </div>

    <DataState :status="status" :error="error" :empty="!data?.length" :refreshing="refreshing" empty-label="No channels yet." empty-icon="i-lucide-satellite-dish">
      <div class="space-y-2">
        <div v-for="c in data" :key="c.id" class="panel-flush grid grid-cols-2 items-center gap-3 p-3.5 sm:grid-cols-12">
          <div class="col-span-2 min-w-0 sm:col-span-5">
            <div class="flex items-center gap-2.5">
              <UIcon :name="CHANNEL_TYPE_META[c.type as NotificationChannelType]?.icon || 'i-lucide-bell'" class="size-4 shrink-0 text-(--color-muted)" />
              <span class="truncate font-medium text-foam">{{ c.name }}</span>
              <span v-if="!c.enabled" class="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase text-faint">off</span>
            </div>
          </div>
          <div class="text-xs text-(--color-muted) sm:col-span-2">{{ channelTypeLabel(c.type) }}</div>
          <div class="sm:col-span-2">
            <span class="rounded-md px-2 py-0.5 text-xs font-medium"
              :class="c.scope === 'global' ? 'bg-beacon/10 text-beacon' : 'bg-surface-2 text-(--color-muted)'">
              {{ scopeLabel(c.scope) }}
            </span>
          </div>
          <div class="col-span-2 flex justify-end gap-1 sm:col-span-3">
            <UButton size="xs" variant="soft" color="neutral" icon="i-lucide-send" label="Test" :loading="testingId === c.id" @click="testChannel(c)" />
            <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-pencil" aria-label="Edit" @click="openEdit(c)" />
            <UButton size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" aria-label="Delete" @click="deleteTarget = c" />
          </div>
        </div>
      </div>
    </DataState>

    <UModal v-model:open="modalOpen" :title="editingId ? `Edit ${form.name}` : 'Add channel'">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Name" required>
            <UInput v-model="form.name" class="w-full" placeholder="On-call Slack" />
          </UFormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Type" :hint="editingId ? 'Fixed after creation' : undefined">
              <USelect v-model="form.type" :items="typeOptions" value-key="value" label-key="label" class="w-full" :disabled="!!editingId" />
              <p class="mt-1 text-xs text-faint">{{ typeMeta.blurb }}</p>
            </UFormField>
            <UFormField label="Scope">
              <USelect v-model="form.scope" :items="scopeOptions" value-key="value" label-key="label" class="w-full" />
              <p class="mt-1 text-xs text-faint">Who can use this channel.</p>
            </UFormField>
          </div>

          <div class="space-y-3 border-t border-hull-soft pt-4">
            <UFormField v-for="f in typeMeta.fields" :key="f.key" :label="f.label" :required="f.required && !editingId">
              <UInput
                v-model="form.config[f.key]"
                :type="f.kind === 'password' ? 'password' : (f.kind === 'number' ? 'number' : 'text')"
                class="w-full"
                :class="f.kind === 'text' && (f.key.includes('url') || f.key === 'to') ? 'font-mono' : ''"
                autocomplete="off"
                :placeholder="editingId ? 'Leave blank to keep current' : f.placeholder"
              />
              <p v-if="f.help" class="mt-1 text-xs text-faint">{{ f.help }}</p>
            </UFormField>
          </div>

          <UFormField>
            <UCheckbox v-model="form.enabled" label="Enabled" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" label="Cancel" @click="modalOpen = false" />
          <UButton color="primary" :label="editingId ? 'Save' : 'Create'" icon="i-lucide-check" :loading="saving" @click="save" />
        </div>
      </template>
    </UModal>

    <ConfirmDeleteModal
      type="notification.channel"
      :item-name="deleteTarget?.name"
      :open="!!deleteTarget"
      @update:open="(v: boolean) => { if (!v) deleteTarget = null }"
      title="Delete channel"
      :message="deleteTarget ? `Channel ${deleteTarget.name} will be removed. Any app or rule that uses it stops delivering there.` : ''"
      :action="confirmDelete"
    />
  </div>
</template>
