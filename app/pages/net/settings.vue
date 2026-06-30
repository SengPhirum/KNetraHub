<script setup lang="ts">
// Network app administrator settings. Real features now live here: device
// onboarding templates (managed CRUD), the canonical device-category reference
// (shared by the Add Device + Settings forms), and a fleet/poller summary.
// Gated by the net admin tier (net.manage), mirroring the Dock app's settings.
definePageMeta({
  middleware: [
    function () {
      const { hasPermission } = useAuth()
      if (!hasPermission('net.manage')) return navigateTo('/net')
    }
  ]
})

const tabs = [
  { label: 'Device Templates', icon: 'i-lucide-copy-plus', slot: 'templates' as const },
  { label: 'Categories', icon: 'i-lucide-tags', slot: 'categories' as const },
  { label: 'Poller', icon: 'i-lucide-radio-tower', slot: 'poller' as const }
]

// --- Templates --------------------------------------------------------------
const { data: templates, refresh } = useAsyncData('netSettingsTemplates', () => $fetch<any[]>('/api/net/templates'), { default: () => [] as any[] })
const { data: devices } = useAsyncData('netSettingsDevices', () => $fetch<any[]>('/api/net/devices'), { default: () => [] as any[] })

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
    if (editingId.value) {
      await $fetch(`/api/net/templates/${editingId.value}`, { method: 'PUT', body: { ...form } })
    } else {
      await $fetch('/api/net/templates', { method: 'POST', body: { ...form } })
    }
    modalOpen.value = false
    await refresh()
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
    await refresh()
  } finally {
    deleting.value = false
  }
}

// --- Poller / fleet summary -------------------------------------------------
const fleet = computed(() => {
  const list = devices.value || []
  return {
    total: list.length,
    monitored: list.filter((d) => d.monitoring_enabled !== false).length,
    paused: list.filter((d) => d.monitoring_enabled === false).length,
    up: list.filter((d) => d.status === 'up').length,
    down: list.filter((d) => d.status === 'down').length,
    snmp: list.filter((d) => d.poll_method === 'snmp').length
  }
})
</script>

<template>
  <div>
    <PageHeader title="Network settings" subtitle="Administrator settings for the Network app" icon="i-lucide-settings">
      <template #actions>
        <UButton icon="i-lucide-arrow-left" color="neutral" variant="soft" label="Back to Network" to="/net" />
      </template>
    </PageHeader>

    <UTabs :items="tabs" variant="link" class="max-w-5xl" :unmount-on-hide="false">
      <!-- Device Templates ------------------------------------------------- -->
      <template #templates>
        <div class="pt-4 space-y-4">
          <div class="flex items-center justify-between">
            <p class="text-sm text-(--color-muted)">Saved monitoring defaults you can apply when onboarding a new device.</p>
            <UButton icon="i-lucide-plus" size="sm" @click="openCreate">New Template</UButton>
          </div>

          <div v-if="!templates.length" class="panel flex flex-col items-center gap-2 p-10 text-center">
            <UIcon name="i-lucide-copy-plus" class="size-7 text-beacon" />
            <h3 class="font-display text-sm font-semibold text-foam">No templates yet</h3>
            <p class="max-w-md text-xs text-(--color-muted)">Create a template (e.g. "Core Switch — SNMPv3") so adding similar devices is a single pick on the Add Device form.</p>
          </div>

          <div v-else class="grid gap-4 sm:grid-cols-2">
            <div v-for="t in templates" :key="t.id" class="panel p-4 flex flex-col">
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
      </template>

      <!-- Categories ------------------------------------------------------- -->
      <template #categories>
        <div class="pt-4 space-y-4">
          <p class="text-sm text-(--color-muted)">
            The canonical device categories. Both the Add Device form and a device's Settings tab use this single list, so
            the label you pick when creating a device is exactly what you see everywhere else.
          </p>
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

      <!-- Poller ----------------------------------------------------------- -->
      <template #poller>
        <div class="pt-4 space-y-4">
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div class="panel p-4"><div class="text-xs uppercase text-faint">Devices</div><div class="mt-1 text-2xl font-display font-semibold text-foam">{{ fleet.total }}</div></div>
            <div class="panel p-4"><div class="text-xs uppercase text-faint">Monitored</div><div class="mt-1 text-2xl font-display font-semibold text-emerald-500">{{ fleet.monitored }}</div></div>
            <div class="panel p-4"><div class="text-xs uppercase text-faint">Paused</div><div class="mt-1 text-2xl font-display font-semibold text-amber-500">{{ fleet.paused }}</div></div>
            <div class="panel p-4"><div class="text-xs uppercase text-faint">Up</div><div class="mt-1 text-2xl font-display font-semibold text-emerald-500">{{ fleet.up }}</div></div>
            <div class="panel p-4"><div class="text-xs uppercase text-faint">Down</div><div class="mt-1 text-2xl font-display font-semibold text-rose-500">{{ fleet.down }}</div></div>
            <div class="panel p-4"><div class="text-xs uppercase text-faint">SNMP</div><div class="mt-1 text-2xl font-display font-semibold text-foam">{{ fleet.snmp }}</div></div>
          </div>
          <div class="panel p-5 text-sm text-(--color-muted) space-y-2">
            <h3 class="font-medium text-foam">How polling works</h3>
            <p>The poller ICMP-pings every monitored device each cycle and reads SNMP system + interface data from devices that respond. Paused devices are skipped.</p>
            <p>Interval and concurrency are set via environment variables (<code class="font-mono text-foam">NUXT_NET_POLL_INTERVAL_SECONDS</code>, <code class="font-mono text-foam">NUXT_NET_POLL_CONCURRENCY</code>, …). See the Network Monitoring guide for the full list.</p>
          </div>
        </div>
      </template>
    </UTabs>

    <!-- Template editor -->
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
