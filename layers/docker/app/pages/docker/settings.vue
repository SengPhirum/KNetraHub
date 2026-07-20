<script setup lang="ts">
// Dock app administrator settings. These belong to the Docker app specifically,
// not the portal: GitLab stack versioning (Integrations) and Swarm alerting.
// Gated by the per-app docker admin tier - the same boundary the
// /api/gitlab/* and /api/alerts/* routes already enforce server-side
// (server/middleware/appAccess.ts).
definePageMeta({
  middleware: [
    function () {
      const { hasPermission } = useAuth()
      if (!hasPermission('docker.manage')) return navigateTo('/docker')
    }
  ]
})

interface GitlabStatus {
  configured: boolean
  connected: boolean
  error?: string
  url: string
  projectId: string
  branch: string
  stacksPath: string
  enabled: boolean
  hasToken: boolean
  overridden: boolean
}

interface AlertChannel {
  id: string
  name: string
  type: 'telegram' | 'teams' | 'webhook'
  enabled: boolean
  createdAt: string
  updatedAt: string
}

interface AlertRule {
  type: string
  enabled: boolean
  config: Record<string, any>
  template: string
  placeholders: string[]
}

const toast = useToast()

const tabs = [
  { label: 'Integrations', icon: 'i-lucide-plug', slot: 'integrations' as const },
  { label: 'Alerts', icon: 'i-lucide-bell', slot: 'alerts' as const }
]

function sourceLabel(overridden?: boolean) {
  return overridden ? 'DB override' : 'Env default'
}
function sourceColor(overridden?: boolean) {
  return overridden ? 'primary' : 'neutral'
}

// ─── GitLab ───────────────────────────────────────────────────────────────────
const { data: gl, refresh: refreshGitlab } = useFetch<GitlabStatus>('/api/gitlab/status', { lazy: true })
const gitlabForm = reactive({ enabled: false, url: '', token: '', projectId: '', branch: '', stacksPath: '' })
const savingGitlab = ref(false)
const resettingGitlab = ref(false)
const testingGitlab = ref(false)

watch(gl, (value) => {
  if (!value) return
  Object.assign(gitlabForm, {
    enabled: value.enabled,
    url: value.url,
    token: '',
    projectId: value.projectId,
    branch: value.branch,
    stacksPath: value.stacksPath
  })
}, { immediate: true })

function gitlabStatusLabel() {
  if (!gl.value) return 'Loading...'
  if (!gl.value.configured) return 'Not configured'
  if (gl.value.connected) return 'Connected'
  return `Unreachable${gl.value.error ? ': ' + gl.value.error : ''}`
}
function gitlabDotClass() {
  if (!gl.value?.configured) return 'dot-idle'
  return gl.value.connected ? 'dot-running' : 'dot-down'
}
function gitlabStatusClass() {
  if (!gl.value?.configured) return 'text-(--color-muted)'
  return gl.value.connected ? 'status-running' : 'status-down'
}

async function saveGitlab() {
  savingGitlab.value = true
  try {
    await $fetch('/api/gitlab/settings', { method: 'PUT', body: { ...gitlabForm } })
    toast.add({ title: 'GitLab settings saved', color: 'primary', icon: 'i-lucide-check' })
    await refreshGitlab()
  } catch (e: any) {
    toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    savingGitlab.value = false
  }
}

async function testGitlabConnection() {
  testingGitlab.value = true
  try {
    await refreshGitlab()
    if (gl.value?.connected) toast.add({ title: 'GitLab connection OK', color: 'primary', icon: 'i-lucide-check' })
    else toast.add({ title: 'GitLab connection failed', description: gl.value?.error, color: 'error' })
  } finally {
    testingGitlab.value = false
  }
}

async function resetGitlab() {
  if (!confirm('Reset GitLab settings to environment defaults?')) return
  resettingGitlab.value = true
  try {
    await $fetch('/api/gitlab/settings', { method: 'DELETE' })
    toast.add({ title: 'GitLab now follows environment defaults', color: 'primary', icon: 'i-lucide-rotate-ccw' })
    await refreshGitlab()
  } catch (e: any) {
    toast.add({ title: 'Reset failed', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    resettingGitlab.value = false
  }
}

// ─── Alerts: channels ──────────────────────────────────────────────────────────
const { data: channels, refresh: refreshChannels } = useFetch<AlertChannel[]>('/api/alerts/channels', { lazy: true, default: () => [] })
const { data: rules, refresh: refreshRules } = useFetch<AlertRule[]>('/api/alerts/rules', { lazy: true, default: () => [] })

const channelTypeItems = [
  { label: 'Telegram', value: 'telegram' },
  { label: 'Microsoft Teams', value: 'teams' },
  { label: 'Webhook', value: 'webhook' }
]

const channelModalOpen = ref(false)
const channelModalMode = ref<'create' | 'edit'>('create')
const channelForm = reactive({ id: '', name: '', type: 'telegram' as 'telegram' | 'teams' | 'webhook', enabled: true, botToken: '', chatId: '', webhookUrl: '', url: '', headersText: '' })
const savingChannel = ref(false)
const testingChannelId = ref<string | null>(null)
const deletingChannelId = ref<string | null>(null)

function channelTypeIcon(type: string) {
  if (type === 'telegram') return 'i-lucide-send'
  if (type === 'teams') return 'i-lucide-users'
  return 'i-lucide-webhook'
}
function channelTypeLabel(type: string) {
  return channelTypeItems.find((i) => i.value === type)?.label || type
}

// Vue's template parser closes a mustache interpolation at the first "}}"
// it sees, even inside a JS string - a literal "{{x}}" placeholder chip
// can't be built inline in the template, so it's built here instead.
function placeholderChip(name: string) {
  return '{' + '{' + name + '}' + '}'
}

function openCreateChannel() {
  channelModalMode.value = 'create'
  Object.assign(channelForm, { id: '', name: '', type: 'telegram', enabled: true, botToken: '', chatId: '', webhookUrl: '', url: '', headersText: '' })
  channelModalOpen.value = true
}
function openEditChannel(ch: AlertChannel) {
  channelModalMode.value = 'edit'
  Object.assign(channelForm, { id: ch.id, name: ch.name, type: ch.type, enabled: ch.enabled, botToken: '', chatId: '', webhookUrl: '', url: '', headersText: '' })
  channelModalOpen.value = true
}

function buildChannelConfig(): Record<string, any> {
  if (channelForm.type === 'telegram') return { botToken: channelForm.botToken, chatId: channelForm.chatId }
  if (channelForm.type === 'teams') return { webhookUrl: channelForm.webhookUrl }
  const headers: Record<string, string> = {}
  for (const line of channelForm.headersText.split('\n')) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    if (key) headers[key] = line.slice(idx + 1).trim()
  }
  return { url: channelForm.url, headers }
}

async function saveChannel() {
  savingChannel.value = true
  try {
    const config = buildChannelConfig()
    if (channelModalMode.value === 'create') {
      await $fetch('/api/alerts/channels', { method: 'POST', body: { name: channelForm.name, type: channelForm.type, enabled: channelForm.enabled, config } })
      toast.add({ title: 'Channel added', color: 'primary', icon: 'i-lucide-check' })
    } else {
      await $fetch(`/api/alerts/channels/${channelForm.id}`, { method: 'PATCH', body: { name: channelForm.name, enabled: channelForm.enabled, config } })
      toast.add({ title: 'Channel updated', color: 'primary', icon: 'i-lucide-check' })
    }
    channelModalOpen.value = false
    await refreshChannels()
  } catch (e: any) {
    toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    savingChannel.value = false
  }
}

async function testChannel(id: string) {
  testingChannelId.value = id
  try {
    const res = await $fetch<{ ok: boolean; error?: string }>(`/api/alerts/channels/${id}/test`, { method: 'POST' })
    if (res.ok) toast.add({ title: 'Test message sent', color: 'primary', icon: 'i-lucide-check' })
    else toast.add({ title: 'Test failed', description: res.error, color: 'error' })
  } catch (e: any) {
    toast.add({ title: 'Test failed', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    testingChannelId.value = null
  }
}

const channelToDelete = ref<AlertChannel | null>(null)
async function confirmDeleteChannel(headers: Record<string, string>) {
  const ch = channelToDelete.value
  if (!ch) return
  await $fetch(`/api/alerts/channels/${ch.id}`, { method: 'DELETE', headers })
  toast.add({ title: 'Channel deleted', color: 'primary' })
  channelToDelete.value = null
  await refreshChannels()
}

// ─── Alerts: rules ─────────────────────────────────────────────────────────────
const RULE_LABELS: Record<string, { label: string; icon: string; hint?: string }> = {
  deploy_failed: { label: 'Deploy failed', icon: 'i-lucide-circle-x' },
  usage_threshold: { label: 'Usage threshold', icon: 'i-lucide-gauge' },
  node_down: { label: 'Node down', icon: 'i-lucide-server-off' },
  replicas_degraded: { label: 'Replicas degraded', icon: 'i-lucide-trending-down' },
  disk_usage_threshold: { label: 'Disk usage threshold', icon: 'i-lucide-hard-drive' },
  stack_deployed: { label: 'Stack deployed / updated', icon: 'i-lucide-rocket', hint: 'Fires on every successful stack deploy, update or rollback.' },
  stack_removed: { label: 'Stack removed', icon: 'i-lucide-layers', hint: 'Fires when a stack and its services are removed.' },
  service_down: { label: 'Service down', icon: 'i-lucide-power-off', hint: '0 running replicas while some are desired.' },
  service_recovered: { label: 'Service recovered', icon: 'i-lucide-heart-pulse', hint: 'Fires when a previously-down service is running again.' },
  service_redeployed: { label: 'Service redeployed', icon: 'i-lucide-refresh-cw', hint: 'Manual redeploys and automatic image-digest redeploys.' },
  service_scaled: { label: 'Service scaled', icon: 'i-lucide-scaling', hint: 'Fires when a service replica count is changed.' },
  service_image_updated: { label: 'Service image updated', icon: 'i-lucide-container', hint: 'Fires when a service is switched to a different image.' },
  task_failed: { label: 'Task failed', icon: 'i-lucide-octagon-alert', hint: 'A task entered the failed or rejected state.' },
  task_shutdown: { label: 'Task shutdown', icon: 'i-lucide-square-power', hint: 'A task was shut down. Noisy: every redeploy/scale-down shuts tasks down.' }
}

const ruleEdits = reactive<Record<string, { enabled: boolean; config: Record<string, any>; template: string; templateOpen: boolean }>>({})
watch(rules, (list) => {
  if (!list) return
  for (const r of list) {
    ruleEdits[r.type] = { enabled: r.enabled, config: { ...r.config }, template: r.template, templateOpen: ruleEdits[r.type]?.templateOpen ?? false }
  }
}, { immediate: true })

const savingRule = ref<string | null>(null)
const resettingRule = ref<string | null>(null)

async function saveRule(type: string) {
  savingRule.value = type
  try {
    const edit = ruleEdits[type]!
    await $fetch(`/api/alerts/rules/${type}`, { method: 'PUT', body: { enabled: edit.enabled, config: edit.config, template: edit.template } })
    toast.add({ title: 'Rule saved', color: 'primary', icon: 'i-lucide-check' })
    await refreshRules()
  } catch (e: any) {
    toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    savingRule.value = null
  }
}

async function resetRule(type: string) {
  if (!confirm('Reset this rule to its default configuration and template?')) return
  resettingRule.value = type
  try {
    await $fetch(`/api/alerts/rules/${type}/reset`, { method: 'POST' })
    toast.add({ title: 'Rule reset to default', color: 'primary', icon: 'i-lucide-rotate-ccw' })
    await refreshRules()
  } catch (e: any) {
    toast.add({ title: 'Reset failed', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    resettingRule.value = null
  }
}
</script>

<template>
  <div>
    <PageHeader title="Dock settings" subtitle="GitLab stack versioning and Swarm alerting for the Docker app" icon="i-lucide-settings">
      <template #actions>
        <UButton icon="i-lucide-arrow-left" color="neutral" variant="soft" label="Back to Dock" to="/docker" />
      </template>
    </PageHeader>

    <UTabs :items="tabs" variant="link" class="max-w-5xl" :unmount-on-hide="false">
      <template #integrations>
        <div class="grid gap-4 pt-4 xl:grid-cols-2">
          <section class="panel p-5 space-y-5">
            <header class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div class="min-w-0">
                <h3 class="font-display text-sm font-semibold text-foam flex items-center gap-2">
                  <UIcon name="i-lucide-git-branch" class="size-4 text-beacon" />
                  GitLab
                </h3>
                <div class="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  <span class="dot" :class="gitlabDotClass()" />
                  <span :class="gitlabStatusClass()">{{ gitlabStatusLabel() }}</span>
                  <UBadge :color="sourceColor(gl?.overridden)" variant="subtle" :label="sourceLabel(gl?.overridden)" />
                </div>
              </div>
              <USwitch v-model="gitlabForm.enabled" color="primary" class="self-start" />
            </header>

            <div class="grid gap-3 sm:grid-cols-2">
              <UFormField label="GitLab URL">
                <UInput v-model="gitlabForm.url" class="w-full font-mono" placeholder="https://gitlab.com" />
              </UFormField>
              <UFormField label="Project ID">
                <UInput v-model="gitlabForm.projectId" class="w-full font-mono" />
              </UFormField>
              <UFormField label="Branch">
                <UInput v-model="gitlabForm.branch" class="w-full font-mono" placeholder="main" />
              </UFormField>
              <UFormField label="Stacks path">
                <UInput v-model="gitlabForm.stacksPath" class="w-full font-mono" placeholder="stacks" />
              </UFormField>
              <UFormField label="Access token" class="sm:col-span-2">
                <UInput
                  v-model="gitlabForm.token"
                  type="password"
                  class="w-full font-mono"
                  :placeholder="gl?.hasToken ? 'Configured - leave blank to keep' : 'Not set'"
                />
              </UFormField>
            </div>

            <footer class="flex flex-col gap-2 border-t border-hull pt-4 sm:flex-row sm:justify-end">
              <UButton color="neutral" variant="ghost" label="Test connection" icon="i-lucide-plug-zap" :loading="testingGitlab" @click="testGitlabConnection" />
              <UButton color="neutral" variant="ghost" label="Use env defaults" icon="i-lucide-rotate-ccw" :disabled="!gl?.overridden" :loading="resettingGitlab" @click="resetGitlab" />
              <UButton color="primary" label="Save GitLab" icon="i-lucide-save" :loading="savingGitlab" @click="saveGitlab" />
            </footer>
          </section>
        </div>
      </template>

      <template #alerts>
        <div class="space-y-5 pt-4">
          <section class="panel p-5">
            <header class="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 class="font-display text-sm font-semibold text-foam flex items-center gap-2">
                  <UIcon name="i-lucide-send" class="size-4 text-beacon" />
                  Notification channels
                </h3>
                <p class="mt-1 text-xs text-(--color-muted)">Where alerts are delivered. Every enabled channel receives every fired alert.</p>
              </div>
              <UButton color="primary" variant="soft" icon="i-lucide-plus" label="Add channel" @click="openCreateChannel" />
            </header>

            <div v-if="!channels?.length" class="rounded-lg border border-dashed border-hull p-6 text-center text-sm text-(--color-muted)">
              No channels configured yet.
            </div>
            <div v-else class="divide-y divide-hull">
              <div v-for="ch in channels" :key="ch.id" class="flex flex-wrap items-center justify-between gap-3 py-3">
                <div class="flex min-w-0 items-center gap-3">
                  <UIcon :name="channelTypeIcon(ch.type)" class="size-4 shrink-0 text-beacon" />
                  <div class="min-w-0">
                    <p class="truncate text-sm text-foam">{{ ch.name }}</p>
                    <p class="text-xs text-faint">{{ channelTypeLabel(ch.type) }}</p>
                  </div>
                  <UBadge :color="ch.enabled ? 'primary' : 'neutral'" variant="subtle" :label="ch.enabled ? 'Enabled' : 'Disabled'" />
                </div>
                <div class="flex items-center gap-2">
                  <UButton size="xs" color="neutral" variant="soft" icon="i-lucide-send" label="Test" :loading="testingChannelId === ch.id" @click="testChannel(ch.id)" />
                  <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-pencil" aria-label="Edit channel" @click="openEditChannel(ch)" />
                  <UButton size="xs" color="error" variant="ghost" icon="i-lucide-trash-2" aria-label="Delete channel" :loading="deletingChannelId === ch.id" @click="channelToDelete = ch" />
                </div>
              </div>
            </div>
          </section>

          <section class="panel p-5">
            <h3 class="font-display text-sm font-semibold text-foam flex items-center gap-2 mb-1">
              <UIcon name="i-lucide-bell" class="size-4 text-beacon" />
              Alert rules
            </h3>
            <p class="mb-4 text-xs text-(--color-muted)">Toggle what triggers an alert, tune thresholds, and customize the message sent to every channel above.</p>

            <div class="grid gap-4 lg:grid-cols-2">
              <div v-for="rule in rules" :key="rule.type" class="rounded-lg border border-hull-soft bg-surface-2/40 p-4">
                <div v-if="ruleEdits[rule.type]" class="flex items-center justify-between gap-3 mb-3">
                  <div class="flex items-center gap-2">
                    <UIcon :name="RULE_LABELS[rule.type]?.icon || 'i-lucide-bell'" class="size-4 text-beacon" />
                    <p class="text-sm font-semibold text-foam">{{ RULE_LABELS[rule.type]?.label || rule.type }}</p>
                  </div>
                  <USwitch v-model="ruleEdits[rule.type]!.enabled" color="primary" />
                </div>

                <template v-if="ruleEdits[rule.type]">
                  <p v-if="RULE_LABELS[rule.type]?.hint" class="mb-3 -mt-1 text-xs text-(--color-muted)">{{ RULE_LABELS[rule.type]!.hint }}</p>
                  <div v-if="rule.type === 'usage_threshold'" class="mb-3 grid grid-cols-2 gap-3">
                    <UFormField label="CPU threshold (%)">
                      <UInput v-model.number="ruleEdits[rule.type]!.config.cpuPercent" type="number" min="1" max="100" class="w-full" />
                    </UFormField>
                    <UFormField label="Memory threshold (%)">
                      <UInput v-model.number="ruleEdits[rule.type]!.config.memoryPercent" type="number" min="1" max="100" class="w-full" />
                    </UFormField>
                  </div>
                  <div v-else-if="rule.type === 'replicas_degraded' || rule.type === 'service_down'" class="mb-3">
                    <UFormField label="Grace period (minutes)">
                      <UInput v-model.number="ruleEdits[rule.type]!.config.gracePeriodMinutes" type="number" min="0" class="w-40" />
                    </UFormField>
                  </div>
                  <div v-else-if="rule.type === 'disk_usage_threshold'" class="mb-3">
                    <UFormField label="Disk threshold (%)">
                      <UInput v-model.number="ruleEdits[rule.type]!.config.percent" type="number" min="1" max="100" class="w-40" />
                    </UFormField>
                  </div>

                  <button
                    type="button"
                    class="mb-2 flex items-center gap-1.5 text-xs text-faint transition hover:text-foam"
                    @click="ruleEdits[rule.type]!.templateOpen = !ruleEdits[rule.type]!.templateOpen"
                  >
                    <UIcon :name="ruleEdits[rule.type]!.templateOpen ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-3.5" />
                    Customize message
                  </button>
                  <div v-if="ruleEdits[rule.type]!.templateOpen" class="mb-3 space-y-2">
                    <UTextarea v-model="ruleEdits[rule.type]!.template" class="w-full font-mono text-xs" :rows="2" />
                    <div class="flex flex-wrap gap-1.5">
                      <span v-for="p in rule.placeholders" :key="p" class="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-beacon">{{ placeholderChip(p) }}</span>
                    </div>
                  </div>
                </template>

                <footer class="flex justify-end gap-2 border-t border-hull pt-3">
                  <UButton size="xs" color="neutral" variant="ghost" label="Reset" icon="i-lucide-rotate-ccw" :loading="resettingRule === rule.type" @click="resetRule(rule.type)" />
                  <UButton size="xs" color="primary" label="Save" icon="i-lucide-save" :loading="savingRule === rule.type" @click="saveRule(rule.type)" />
                </footer>
              </div>
            </div>
          </section>
        </div>

        <UModal v-model:open="channelModalOpen" :title="channelModalMode === 'create' ? 'Add channel' : 'Edit channel'">
          <template #body>
            <div class="space-y-4">
              <UFormField label="Name">
                <UInput v-model="channelForm.name" class="w-full" placeholder="Ops Telegram" />
              </UFormField>
              <UFormField label="Type">
                <USelect v-model="channelForm.type" :items="channelTypeItems" value-key="value" label-key="label" class="w-full" :disabled="channelModalMode === 'edit'" />
              </UFormField>

              <template v-if="channelForm.type === 'telegram'">
                <UFormField label="Bot token">
                  <UInput v-model="channelForm.botToken" type="password" class="w-full font-mono" :placeholder="channelModalMode === 'edit' ? 'Leave blank to keep existing' : ''" />
                </UFormField>
                <UFormField label="Chat ID">
                  <UInput v-model="channelForm.chatId" class="w-full font-mono" :placeholder="channelModalMode === 'edit' ? 'Leave blank to keep existing' : ''" />
                </UFormField>
              </template>
              <template v-else-if="channelForm.type === 'teams'">
                <UFormField label="Webhook URL">
                  <UInput v-model="channelForm.webhookUrl" type="password" class="w-full font-mono" :placeholder="channelModalMode === 'edit' ? 'Leave blank to keep existing' : ''" />
                </UFormField>
              </template>
              <template v-else>
                <UFormField label="URL">
                  <UInput v-model="channelForm.url" type="password" class="w-full font-mono" :placeholder="channelModalMode === 'edit' ? 'Leave blank to keep existing' : ''" />
                </UFormField>
                <UFormField label="Headers" description="One per line, key: value">
                  <UTextarea v-model="channelForm.headersText" class="w-full font-mono text-xs" :rows="3" />
                </UFormField>
              </template>

              <UFormField label="Enabled">
                <USwitch v-model="channelForm.enabled" color="primary" />
              </UFormField>
            </div>
          </template>
          <template #footer>
            <div class="flex w-full justify-end gap-2">
              <UButton color="neutral" variant="ghost" label="Cancel" @click="channelModalOpen = false" />
              <UButton color="primary" label="Save" icon="i-lucide-save" :loading="savingChannel" @click="saveChannel" />
            </div>
          </template>
        </UModal>
      </template>
    </UTabs>

    <ConfirmDeleteModal
      type="alert-channel"
      :item-name="channelToDelete?.name"
      :open="!!channelToDelete"
      @update:open="(v: boolean) => { if (!v) channelToDelete = null }"
      title="Delete channel"
      :message="channelToDelete ? `Channel ${channelToDelete.name} will be deleted. Rules using it stop delivering through this channel.` : ''"
      :action="confirmDeleteChannel"
    />
  </div>
</template>
