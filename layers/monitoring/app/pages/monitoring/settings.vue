<script setup lang="ts">
// Unified Monitoring settings: Network and Server admin settings used to be two
// separate pages — now they're ONE page, with tabs spanning both domains
// (Templates/Poller mix network + server content in the same tab; items that
// are domain-specific are tagged so it's clear which side they belong to).
definePageMeta({
  middleware: [
    function () {
      const { hasPermission } = useAuth()
      if (!hasPermission('monitoring.manage')) return navigateTo('/monitoring')
    }
  ]
})

const tabs = [
  { label: 'Templates', icon: 'i-lucide-copy-plus', slot: 'templates' as const },
  { label: 'Categories', icon: 'i-lucide-tags', slot: 'categories' as const },
  { label: 'Poller', icon: 'i-lucide-radio-tower', slot: 'poller' as const },
  { label: 'Alerts', icon: 'i-lucide-bell', slot: 'alerts' as const }
]

const toast = useToast()

// ── Templates: Network device templates (full CRUD here) + Server templates
// (Zabbix items/triggers - summarized here, managed on their own page since
// item/trigger editing needs more room). ────────────────────────────────────
const { data: netTemplates, refresh: refreshNetTemplates } = useAsyncData('settingsNetTemplates', () => $fetch<any[]>('/api/net/templates'), { default: () => [] as any[] })
const { data: srvTemplates, refresh: refreshSrvTemplates } = useAsyncData('settingsSrvTemplates', () => $fetch<any[]>('/api/server/templates'), { default: () => [] as any[] })
const { data: devices } = useAsyncData('settingsNetDevices', () => $fetch<any[]>('/api/net/devices'), { default: () => [] as any[] })
const { data: hosts } = useAsyncData('settingsSrvHosts', () => $fetch<any[]>('/api/server/hosts'), { default: () => [] as any[] })

// Network device templates: JSON export/import (native format only - no
// Zabbix equivalent for PRTG-style device templates).
async function exportNetTemplates() {
  const rows = await $fetch<any[]>('/api/net/templates/export')
  downloadJson(exportFilename('device-templates', 'json'), rows)
}
const importingNetTemplates = ref(false)
async function importNetTemplates() {
  const file = await pickAndReadFile('.json')
  if (!file) return
  importingNetTemplates.value = true
  try {
    const body = JSON.parse(file.text)
    const result = await $fetch<{ added: number; skipped: number }>('/api/net/templates/import', { method: 'POST', body })
    toast.add({ title: `Imported ${result.added} device template${result.added === 1 ? '' : 's'}`, description: result.skipped ? `${result.skipped} skipped (name already exists)` : undefined, color: 'primary', icon: 'i-lucide-check' })
    await refreshNetTemplates()
  } catch (e: any) {
    toast.add({ title: 'Import failed', description: e?.data?.statusMessage || 'Could not parse the file', color: 'error' })
  } finally {
    importingNetTemplates.value = false
  }
}

// Server templates: JSON export/import - import accepts EITHER our native
// export shape OR a real Zabbix template export (auto-detected server-side).
async function exportSrvTemplates() {
  const rows = await $fetch<any[]>('/api/server/templates/export')
  downloadJson(exportFilename('server-templates', 'json'), rows)
}
const importingSrvTemplates = ref(false)
async function importSrvTemplates() {
  const file = await pickAndReadFile('.json')
  if (!file) return
  importingSrvTemplates.value = true
  try {
    const body = JSON.parse(file.text)
    const result = await $fetch<{ added: number; skipped: number; skippedTriggers: string[] }>('/api/server/templates/import', { method: 'POST', body })
    toast.add({
      title: `Imported ${result.added} template${result.added === 1 ? '' : 's'}`,
      description: [
        result.skipped ? `${result.skipped} template(s) skipped (name already exists)` : null,
        result.skippedTriggers.length ? `${result.skippedTriggers.length} trigger(s) couldn't be converted: ${result.skippedTriggers.slice(0, 3).join('; ')}${result.skippedTriggers.length > 3 ? '…' : ''}` : null
      ].filter(Boolean).join(' · ') || undefined,
      color: result.added ? 'primary' : 'warning',
      icon: 'i-lucide-check'
    })
    await refreshSrvTemplates()
  } catch (e: any) {
    toast.add({ title: 'Import failed', description: e?.data?.statusMessage || 'Could not parse the file', color: 'error' })
  } finally {
    importingSrvTemplates.value = false
  }
}

function blankTemplate() {
  return {
    name: '',
    description: '',
    category: 'network',
    poll_method: 'snmp',
    snmp_version: 'v2c',
    snmp_community: 'public',
    ...defaultSnmpV3()
  }
}
const form = reactive(blankTemplate())
const editingId = ref<string | null>(null)
const modalOpen = ref(false)
const saving = ref(false)

function openCreate() {
  Object.assign(form, blankTemplate())
  editingId.value = null
  modalOpen.value = true
}
function openEdit(t: any) {
  Object.assign(form, blankTemplate(), {
    name: t.name,
    description: t.description || '',
    category: t.category || 'network',
    poll_method: t.poll_method || 'snmp',
    snmp_version: t.snmp_version || 'v2c',
    snmp_community: t.snmp_community || 'public',
    snmp_sec_level: t.snmp_sec_level || defaultSnmpV3().snmp_sec_level,
    snmp_auth_user: t.snmp_auth_user || '',
    snmp_auth_protocol: t.snmp_auth_protocol || defaultSnmpV3().snmp_auth_protocol,
    snmp_auth_password: t.snmp_auth_password || '',
    snmp_priv_protocol: t.snmp_priv_protocol || defaultSnmpV3().snmp_priv_protocol,
    snmp_priv_password: t.snmp_priv_password || ''
  })
  editingId.value = t.id
  modalOpen.value = true
}
async function saveTemplate() {
  if (!form.name.trim()) return
  saving.value = true
  try {
    if (editingId.value) await $fetch(`/api/net/templates/${editingId.value}`, { method: 'PUT', body: { ...form } })
    else await $fetch('/api/net/templates', { method: 'POST', body: { ...form } })
    modalOpen.value = false
    await refreshNetTemplates()
  } finally {
    saving.value = false
  }
}

const deleteTarget = ref<any>(null)
const deleting = ref(false)
async function confirmDelete() {
  if (!deleteTarget.value) return
  deleting.value = true
  try {
    await $fetch(`/api/net/templates/${deleteTarget.value.id}`, { method: 'DELETE' })
    deleteTarget.value = null
    await refreshNetTemplates()
  } finally {
    deleting.value = false
  }
}

// ── Poller: merged Network + Server fleet/collection stats ─────────────────
const netFleet = computed(() => {
  const list = devices.value || []
  return {
    total: list.length,
    monitored: list.filter((d: any) => d.monitoring_enabled !== false).length,
    paused: list.filter((d: any) => d.monitoring_enabled === false).length,
    up: list.filter((d: any) => d.status === 'up').length,
    down: list.filter((d: any) => d.status === 'down').length,
    snmp: list.filter((d: any) => d.poll_method === 'snmp').length
  }
})
const srvFleet = computed(() => {
  const list = hosts.value || []
  return {
    total: list.length,
    monitored: list.filter((h: any) => h.monitoring_enabled !== false).length,
    paused: list.filter((h: any) => h.monitoring_enabled === false).length,
    available: list.filter((h: any) => h.availability === 'available').length,
    unavailable: list.filter((h: any) => h.availability === 'unavailable').length,
    snmp: list.filter((h: any) => h.poll_method === 'snmp').length
  }
})
</script>

<template>
  <div>
    <PageHeader title="Monitoring settings" subtitle="Administrator settings for Network and Server, in one place" icon="i-lucide-settings">
      <template #actions>
        <UButton icon="i-lucide-arrow-left" color="neutral" variant="soft" label="Back to Monitoring" to="/monitoring" />
      </template>
    </PageHeader>

    <UTabs :items="tabs" variant="link" class="max-w-5xl" :unmount-on-hide="false">
      <!-- Templates ---------------------------------------------------------- -->
      <template #templates>
        <div class="pt-4 space-y-6">
          <!-- Network device templates: full CRUD -->
          <div>
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center gap-2">
                <UBadge color="info" variant="subtle" size="xs">Network</UBadge>
                <p class="text-sm text-(--color-muted)">Saved monitoring defaults you can apply when onboarding a new device.</p>
              </div>
              <div class="flex items-center gap-2">
                <UButton icon="i-lucide-download" size="sm" color="neutral" variant="soft" :disabled="!netTemplates.length" @click="exportNetTemplates">Export</UButton>
                <UButton icon="i-lucide-upload" size="sm" color="neutral" variant="soft" :loading="importingNetTemplates" @click="importNetTemplates">Import</UButton>
                <UButton icon="i-lucide-plus" size="sm" @click="openCreate">New Template</UButton>
              </div>
            </div>

            <div v-if="!netTemplates.length" class="panel flex flex-col items-center gap-2 p-10 text-center">
              <UIcon name="i-lucide-copy-plus" class="size-7 text-beacon" />
              <h3 class="font-display text-sm font-semibold text-foam">No device templates yet</h3>
              <p class="max-w-md text-xs text-(--color-muted)">Create a template (e.g. "Core Switch — SNMPv3") so adding similar devices is a single pick on the Add Device form.</p>
            </div>

            <div v-else class="grid gap-4 sm:grid-cols-2">
              <div v-for="t in netTemplates" :key="t.id" class="panel p-4 flex flex-col">
                <div class="flex items-start justify-between gap-2">
                  <div class="flex items-center gap-2">
                    <UIcon :name="deviceCategory(t.category)?.icon || 'i-lucide-server'" class="size-4 text-beacon" />
                    <span class="font-medium text-foam">{{ t.name }}</span>
                  </div>
                  <div class="flex items-center gap-1">
                    <UButton size="xs" variant="ghost" icon="i-lucide-pencil" aria-label="Edit template" @click="openEdit(t)" />
                    <UButton size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" aria-label="Delete template" @click="deleteTarget = t" />
                  </div>
                </div>
                <p v-if="t.description" class="mt-1 text-xs text-(--color-muted)">{{ t.description }}</p>
                <div class="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <UBadge size="xs" variant="soft" :color="categoryColor(t.category)">{{ categoryLabel(t.category) }}</UBadge>
                  <UBadge size="xs" variant="subtle" color="neutral" class="uppercase">{{ t.poll_method }}</UBadge>
                  <UBadge v-if="t.poll_method === 'snmp'" size="xs" variant="subtle" color="neutral">SNMP {{ t.snmp_version }}</UBadge>
                </div>
              </div>
            </div>
          </div>

          <!-- Server templates: summary + link to the full items/triggers editor -->
          <div class="border-t border-hull pt-6">
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center gap-2">
                <UBadge color="primary" variant="subtle" size="xs">Server</UBadge>
                <p class="text-sm text-(--color-muted)">Zabbix-style templates (items + triggers) linked onto hosts.</p>
              </div>
              <div class="flex items-center gap-2">
                <UButton icon="i-lucide-download" size="sm" color="neutral" variant="soft" :disabled="!srvTemplates.length" @click="exportSrvTemplates">Export</UButton>
                <UButton icon="i-lucide-upload" size="sm" color="neutral" variant="soft" :loading="importingSrvTemplates" @click="importSrvTemplates">Import</UButton>
                <UButton icon="i-lucide-arrow-up-right" size="sm" color="neutral" variant="soft" to="/monitoring/server/templates">Manage templates</UButton>
              </div>
            </div>
            <p class="mb-3 text-xs text-faint">Import accepts either a file exported from here, or a real Zabbix template export (<code class="font-mono">zabbix_export.templates[]</code> JSON).</p>
            <div v-if="!srvTemplates.length" class="panel p-6 text-center text-sm text-faint">No server templates yet.</div>
            <div v-else class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <NuxtLink v-for="t in srvTemplates" :key="t.id" to="/monitoring/server/templates" class="panel p-4 flex flex-col hover:ring-1 hover:ring-beacon/30 transition">
                <span class="font-medium text-foam truncate">{{ t.name }}</span>
                <span class="mt-1 text-xs text-faint">{{ t.item_count }} items · {{ t.trigger_count }} triggers · {{ t.host_count }} hosts</span>
              </NuxtLink>
            </div>
          </div>
        </div>
      </template>

      <!-- Categories (Network only - no Server equivalent) ------------------- -->
      <template #categories>
        <div class="pt-4 space-y-4">
          <div class="flex items-center gap-2">
            <UBadge color="info" variant="subtle" size="xs">Network</UBadge>
            <p class="text-sm text-(--color-muted)">
              The canonical device categories. Both the Add Device form and a device's Settings tab use this single list, so
              the label you pick when creating a device is exactly what you see everywhere else.
            </p>
          </div>
          <div class="panel divide-y divide-surface">
            <div v-for="c in DEVICE_CATEGORIES" :key="c.value" class="flex items-center gap-4 px-4 py-3">
              <UIcon :name="c.icon" class="size-5 text-beacon" />
              <div class="flex-1">
                <div class="text-sm font-medium text-foam">{{ c.label }}</div>
                <div class="font-mono text-xs text-faint">{{ c.value }}</div>
              </div>
              <UBadge size="xs" variant="soft" :color="c.color">{{ c.short }}</UBadge>
            </div>
          </div>
        </div>
      </template>

      <!-- Poller: merged Network + Server fleet/collection summary ----------- -->
      <template #poller>
        <div class="pt-4 space-y-6">
          <div>
            <div class="flex items-center gap-2 mb-3"><UBadge color="info" variant="subtle" size="xs">Network</UBadge><span class="text-xs text-faint">Device polling</span></div>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div class="panel p-4"><div class="text-xs uppercase text-faint">Devices</div><div class="mt-1 text-2xl font-display font-semibold text-foam">{{ netFleet.total }}</div></div>
              <div class="panel p-4"><div class="text-xs uppercase text-faint">Monitored</div><div class="mt-1 text-2xl font-display font-semibold text-emerald-500">{{ netFleet.monitored }}</div></div>
              <div class="panel p-4"><div class="text-xs uppercase text-faint">Paused</div><div class="mt-1 text-2xl font-display font-semibold text-amber-500">{{ netFleet.paused }}</div></div>
              <div class="panel p-4"><div class="text-xs uppercase text-faint">Up</div><div class="mt-1 text-2xl font-display font-semibold text-emerald-500">{{ netFleet.up }}</div></div>
              <div class="panel p-4"><div class="text-xs uppercase text-faint">Down</div><div class="mt-1 text-2xl font-display font-semibold text-rose-500">{{ netFleet.down }}</div></div>
              <div class="panel p-4"><div class="text-xs uppercase text-faint">SNMP</div><div class="mt-1 text-2xl font-display font-semibold text-foam">{{ netFleet.snmp }}</div></div>
            </div>
            <p class="mt-3 text-xs text-(--color-muted)">
              ICMP-pings every monitored device each cycle; reads SNMP system + interface data from devices that respond. Paused devices are skipped.
              Interval/concurrency: <code class="font-mono text-foam">NUXT_NET_POLL_INTERVAL_SECONDS</code>, <code class="font-mono text-foam">NUXT_NET_POLL_CONCURRENCY</code>.
            </p>
          </div>

          <div class="border-t border-hull pt-6">
            <div class="flex items-center gap-2 mb-3"><UBadge color="primary" variant="subtle" size="xs">Server</UBadge><span class="text-xs text-faint">Host polling</span></div>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div class="panel p-4"><div class="text-xs uppercase text-faint">Hosts</div><div class="mt-1 text-2xl font-display font-semibold text-foam">{{ srvFleet.total }}</div></div>
              <div class="panel p-4"><div class="text-xs uppercase text-faint">Monitored</div><div class="mt-1 text-2xl font-display font-semibold text-emerald-500">{{ srvFleet.monitored }}</div></div>
              <div class="panel p-4"><div class="text-xs uppercase text-faint">Paused</div><div class="mt-1 text-2xl font-display font-semibold text-amber-500">{{ srvFleet.paused }}</div></div>
              <div class="panel p-4"><div class="text-xs uppercase text-faint">Available</div><div class="mt-1 text-2xl font-display font-semibold text-emerald-500">{{ srvFleet.available }}</div></div>
              <div class="panel p-4"><div class="text-xs uppercase text-faint">Unavailable</div><div class="mt-1 text-2xl font-display font-semibold text-rose-500">{{ srvFleet.unavailable }}</div></div>
              <div class="panel p-4"><div class="text-xs uppercase text-faint">SNMP</div><div class="mt-1 text-2xl font-display font-semibold text-foam">{{ srvFleet.snmp }}</div></div>
            </div>
            <p class="mt-3 text-xs text-(--color-muted)">
              ICMP-pings every monitored host each cycle; SNMP hosts also collect CPU/memory/disk/uptime items and evaluate triggers into problems.
              Interval/concurrency: <code class="font-mono text-foam">NUXT_SERVER_POLL_INTERVAL_SECONDS</code>, <code class="font-mono text-foam">NUXT_SERVER_POLL_CONCURRENCY</code>.
            </p>
          </div>
        </div>
      </template>

      <!-- Alerts: shared notification channels ------------------------------- -->
      <template #alerts>
        <div class="pt-4 space-y-4">
          <section class="panel p-5 space-y-3 text-sm text-(--color-muted)">
            <h3 class="font-medium text-foam">Notification channels</h3>
            <p>Channels (Telegram / Teams / Webhook) are configured once, portal-wide, and shared across every app.</p>
            <ul class="list-disc list-inside space-y-1">
              <li><span class="text-foam font-medium">Server</span> — Actions notify a channel when a problem reaches its minimum severity. Configure under <NuxtLink to="/monitoring/server/actions" class="text-beacon hover:underline">Configuration → Actions</NuxtLink>.</li>
              <li><span class="text-foam font-medium">Network</span> — alert rules define thresholds on <NuxtLink to="/monitoring/network/alerts" class="text-beacon hover:underline">Configuration → Alert rules</NuxtLink>; alerts show on the unified <NuxtLink to="/monitoring/problems" class="text-beacon hover:underline">Problems</NuxtLink> page. Channel delivery for Network alerts isn't wired up yet.</li>
            </ul>
          </section>
        </div>
      </template>
    </UTabs>

    <!-- Network template editor -->
    <UModal v-model:open="modalOpen" :title="editingId ? 'Edit Template' : 'New Template'">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Name">
            <UInput v-model="form.name" placeholder="Core Switch — SNMPv3" class="w-full" autofocus />
          </UFormField>
          <UFormField label="Description">
            <UInput v-model="form.description" placeholder="Optional" class="w-full" />
          </UFormField>
          <UFormField label="Category">
            <USelect v-model="form.category" :items="CATEGORY_SELECT_ITEMS" value-key="value" label-key="label" class="w-full" />
          </UFormField>
          <UFormField label="Polling Method">
            <USelect v-model="form.poll_method" :items="[{value:'snmp', label:'SNMP'}, {value:'ping', label:'Ping Only'}]" value-key="value" label-key="label" class="w-full" />
          </UFormField>
          <template v-if="form.poll_method === 'snmp'">
            <NetSnmpFields :form="form" />
          </template>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-3 w-full">
          <UButton variant="ghost" @click="modalOpen = false">Cancel</UButton>
          <UButton color="primary" :loading="saving" :disabled="!form.name.trim()" @click="saveTemplate">{{ editingId ? 'Save' : 'Create' }}</UButton>
        </div>
      </template>
    </UModal>

    <!-- Delete confirmation -->
    <UModal :open="!!deleteTarget" @update:open="(v) => { if (!v) deleteTarget = null }" title="Delete template">
      <template #body>
        <p class="text-sm text-(--color-muted)">
          Delete the template <span class="font-medium text-foam">{{ deleteTarget?.name }}</span>?
          Existing devices created from it are not affected.
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-3 w-full">
          <UButton variant="ghost" @click="deleteTarget = null">Cancel</UButton>
          <UButton color="error" :loading="deleting" @click="confirmDelete">Delete</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
