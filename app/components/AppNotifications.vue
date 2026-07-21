<script setup lang="ts">
import {
  NOTIFICATION_CHANNEL_TYPES, CHANNEL_TYPE_META, channelTypeLabel,
  type NotificationChannelType
} from '~~/shared/utils/notifications'

// Per-app notification panel — the same concept embedded in every sub-app.
// Managers of this app can create/edit/test/delete channels owned by the app
// (auto-tagged with the app scope); Global channels configured by a portal
// admin also deliver here. Backed by the central /api/notifications library, so
// there is one source of truth. Config is write-only (never read back).
const props = defineProps<{
  /** App scope key, e.g. 'docker' | 'monitoring' | 'ipmgt'. */
  scope: string
}>()

const toast = useToast()
const key = computed(() => `app-notif-channels:${props.scope}`)
const { data, status, error, refresh, refreshing } = useApiCache(key.value, () => $fetch<any[]>('/api/notifications/channels', { query: { scope: props.scope } }))
onMounted(refresh)

const typeOptions = NOTIFICATION_CHANNEL_TYPES.map((t) => ({ label: CHANNEL_TYPE_META[t].label, value: t }))

const modalOpen = ref(false)
const editingId = ref<string | null>(null)
const form = reactive({ name: '', type: 'email' as NotificationChannelType, enabled: true, config: {} as Record<string, string> })
const saving = ref(false)
const typeMeta = computed(() => CHANNEL_TYPE_META[form.type])

function blankConfig(type: NotificationChannelType): Record<string, string> {
  return Object.fromEntries(CHANNEL_TYPE_META[type].fields.map((f) => [f.key, '']))
}
watch(() => form.type, (t) => { if (!editingId.value) form.config = blankConfig(t) })

function openCreate() {
  editingId.value = null
  Object.assign(form, { name: '', type: 'email', enabled: true, config: blankConfig('email') })
  modalOpen.value = true
}
function openEdit(c: any) {
  editingId.value = c.id
  Object.assign(form, { name: c.name, type: c.type, enabled: c.enabled, config: blankConfig(c.type) })
  modalOpen.value = true
}

async function save() {
  if (!form.name.trim()) { toast.add({ title: 'Give the channel a name', color: 'warning' }); return }
  saving.value = true
  try {
    const config: Record<string, string> = {}
    for (const [k, v] of Object.entries(form.config)) if (String(v).trim() !== '') config[k] = v
    if (editingId.value) {
      await $fetch(`/api/notifications/channels/${editingId.value}`, { method: 'PATCH', body: { name: form.name, enabled: form.enabled, config } })
      toast.add({ title: `Updated ${form.name}`, color: 'primary', icon: 'i-lucide-check' })
    } else {
      await $fetch('/api/notifications/channels', { method: 'POST', body: { name: form.name, type: form.type, scope: props.scope, enabled: form.enabled, config } })
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
  <section class="panel p-5">
    <header class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 class="flex items-center gap-2 font-display text-sm font-semibold text-foam">
          <UIcon name="i-lucide-satellite-dish" class="size-4 text-beacon" />
          Notification channels
        </h3>
        <p class="mt-1 text-xs text-(--color-muted)">
          Where this app’s alerts are delivered. Add your own below, or reuse the shared
          <NuxtLink to="/admin/notifications/channels" class="text-beacon hover:underline">Global channels</NuxtLink>
          — those deliver here too.
        </p>
      </div>
      <UButton icon="i-lucide-plus" color="primary" variant="soft" label="Add channel" @click="openCreate" />
    </header>

    <DataState :status="status" :error="error" :empty="!data?.length" :refreshing="refreshing"
      empty-label="No channels owned by this app yet. Global channels still apply." empty-icon="i-lucide-satellite-dish">
      <div class="divide-y divide-hull">
        <div v-for="c in data" :key="c.id" class="flex flex-wrap items-center justify-between gap-3 py-3">
          <div class="flex min-w-0 items-center gap-3">
            <UIcon :name="CHANNEL_TYPE_META[c.type as NotificationChannelType]?.icon || 'i-lucide-bell'" class="size-4 shrink-0 text-beacon" />
            <div class="min-w-0">
              <p class="truncate text-sm text-foam">{{ c.name }}</p>
              <p class="text-xs text-faint">{{ channelTypeLabel(c.type) }}</p>
            </div>
            <UBadge :color="c.enabled ? 'primary' : 'neutral'" variant="subtle" :label="c.enabled ? 'Enabled' : 'Disabled'" />
          </div>
          <div class="flex items-center gap-1">
            <UButton size="xs" color="neutral" variant="soft" icon="i-lucide-send" label="Test" :loading="testingId === c.id" @click="testChannel(c)" />
            <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-pencil" aria-label="Edit" @click="openEdit(c)" />
            <UButton size="xs" color="error" variant="ghost" icon="i-lucide-trash-2" aria-label="Delete" @click="deleteTarget = c" />
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
          <UFormField label="Type" :hint="editingId ? 'Fixed after creation' : undefined">
            <USelect v-model="form.type" :items="typeOptions" value-key="value" label-key="label" class="w-full" :disabled="!!editingId" />
            <p class="mt-1 text-xs text-faint">{{ typeMeta.blurb }}</p>
          </UFormField>
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
          <UFormField><UCheckbox v-model="form.enabled" label="Enabled" /></UFormField>
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
      :message="deleteTarget ? `Channel ${deleteTarget.name} will be removed. Alerts stop delivering there.` : ''"
      :action="confirmDelete"
    />
  </section>
</template>
