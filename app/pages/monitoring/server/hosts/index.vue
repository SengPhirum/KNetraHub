<script setup lang="ts">
// Zabbix Hosts: inventory + add/edit (groups, linked templates, ICMP/SNMP
// config). Availability + counts come from the real poller.
const { hasApp, hasPermission } = useAuth()
const toast = useToast()
const canManage = computed(() => hasPermission('monitoring.manage'))

const { data: hosts, status, refresh } = useAsyncData('serverHostsList', () => $fetch<any[]>('/api/server/hosts'), { default: () => [] })
const { data: groups } = useAsyncData('serverHostGroupsOpts', () => $fetch<any[]>('/api/server/hostgroups'), { default: () => [] })
const { data: templates } = useAsyncData('serverTemplatesOpts', () => $fetch<any[]>('/api/server/templates'), { default: () => [] })

onMounted(() => {
  const t = setInterval(refresh, 15000)
  onUnmounted(() => clearInterval(t))
})

const groupItems = computed(() => (groups.value || []).map((g) => ({ value: g.id, label: g.name })))
const templateItems = computed(() => (templates.value || []).map((t) => ({ value: t.id, label: t.name })))
const pollMethods = [
  { value: 'icmp', label: 'ICMP ping only' },
  { value: 'snmp', label: 'SNMP agent' },
  { value: 'none', label: 'No polling' }
]

const open = ref(false)
const editing = ref<any>(null)
const saving = ref(false)
const form = reactive<any>({
  name: '', ip: '', os: '', description: '', poll_method: 'snmp',
  snmp_version: 'v2c', snmp_community: 'public',
  snmp_sec_level: 'authPriv', snmp_auth_user: '', snmp_auth_protocol: 'sha', snmp_auth_password: '',
  snmp_priv_protocol: 'aes', snmp_priv_password: '',
  group_ids: [] as string[], template_ids: [] as string[]
})

function reset() {
  Object.assign(form, {
    name: '', ip: '', os: '', description: '', poll_method: 'snmp',
    snmp_version: 'v2c', snmp_community: 'public',
    snmp_sec_level: 'authPriv', snmp_auth_user: '', snmp_auth_protocol: 'sha', snmp_auth_password: '',
    snmp_priv_protocol: 'aes', snmp_priv_password: '',
    group_ids: [], template_ids: []
  })
}
function openCreate() { editing.value = null; reset(); open.value = true }
async function openEdit(h: any) {
  editing.value = h
  reset()
  const full = await $fetch<any>(`/api/server/hosts/${h.id}`)
  Object.assign(form, {
    name: full.name, ip: full.ip, os: full.os || '', description: full.description || '',
    poll_method: full.poll_method || 'icmp',
    snmp_version: full.snmp_version || 'v2c', snmp_community: full.snmp_community || 'public',
    snmp_sec_level: full.snmp_sec_level || 'authPriv', snmp_auth_user: full.snmp_auth_user || '',
    snmp_auth_protocol: full.snmp_auth_protocol || 'sha', snmp_auth_password: full.snmp_auth_password || '',
    snmp_priv_protocol: full.snmp_priv_protocol || 'aes', snmp_priv_password: full.snmp_priv_password || '',
    group_ids: (full.groups || []).map((g: any) => g.id),
    template_ids: (full.templates || []).map((t: any) => t.id)
  })
  open.value = true
}
async function save() {
  if (!form.name.trim() || !form.ip.trim()) { toast.add({ title: 'Name and IP are required', color: 'error' }); return }
  saving.value = true
  try {
    if (editing.value) await $fetch(`/api/server/hosts/${editing.value.id}`, { method: 'PUT', body: { ...form } })
    else await $fetch('/api/server/hosts', { method: 'POST', body: { ...form } })
    toast.add({ title: editing.value ? 'Host updated' : 'Host created', color: 'primary', icon: 'i-lucide-check' })
    open.value = false
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    saving.value = false
  }
}

const deleteTarget = ref<any>(null)
async function confirmDelete() {
  if (!deleteTarget.value) return
  try {
    await $fetch(`/api/server/hosts/${deleteTarget.value.id}`, { method: 'DELETE' })
    toast.add({ title: 'Host deleted', color: 'primary', icon: 'i-lucide-check' })
    deleteTarget.value = null
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Delete failed', description: e?.data?.statusMessage, color: 'error' })
  }
}

async function togglePause(h: any) {
  try {
    await $fetch(`/api/server/hosts/${h.id}/monitoring`, { method: 'POST', body: { enabled: h.monitoring_enabled === false } })
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Failed', description: e?.data?.statusMessage, color: 'error' })
  }
}

function availClass(h: any) {
  if (h.monitoring_enabled === false) return 'bg-slate-500/10 text-slate-400'
  if (h.availability === 'available') return 'bg-green-500/10 text-green-500'
  if (h.availability === 'unavailable') return 'bg-red-500/10 text-red-500'
  return 'bg-surface-2 text-faint'
}
function availLabel(h: any) {
  if (h.monitoring_enabled === false) return 'Paused'
  if (h.availability === 'available') return 'Available'
  if (h.availability === 'unavailable') return 'Unavailable'
  return 'Unknown'
}
</script>

<template>
  <div>
    <PageHeader title="Hosts" subtitle="Inventory of monitored servers (ICMP + SNMP)" icon="i-lucide-server">
      <template v-if="hasApp('monitoring') && canManage" #actions>
        <UButton icon="i-lucide-plus" size="sm" @click="openCreate">Create host</UButton>
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
            <tr>
              <th class="px-4 py-3 font-medium">Host</th>
              <th class="px-4 py-3 font-medium">Groups</th>
              <th class="px-4 py-3 font-medium">Interface</th>
              <th class="px-4 py-3 font-medium">Availability</th>
              <th class="px-4 py-3 font-medium">Items</th>
              <th class="px-4 py-3 font-medium">Triggers</th>
              <th class="px-4 py-3 font-medium">Problems</th>
              <th class="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-surface">
            <tr v-if="status === 'pending' && !hosts.length"><td colspan="8" class="px-4 py-8 text-center text-faint">Loading…</td></tr>
            <tr v-else-if="!hosts.length"><td colspan="8" class="px-4 py-8 text-center text-faint">No hosts yet. Create one or run Discovery.</td></tr>
            <tr v-for="h in hosts" :key="h.id" class="hover:bg-surface-2/50 transition">
              <td class="px-4 py-3">
                <NuxtLink :to="`/monitoring/server/hosts/${h.id}`" class="font-medium text-foam hover:text-beacon transition">{{ h.name }}</NuxtLink>
                <div class="text-xs text-faint">{{ h.os || '—' }}</div>
              </td>
              <td class="px-4 py-3">
                <div class="flex flex-wrap gap-1">
                  <UBadge v-for="g in h.groups" :key="g.id" color="neutral" variant="subtle" size="xs">{{ g.name }}</UBadge>
                  <span v-if="!h.groups?.length" class="text-faint text-xs">—</span>
                </div>
              </td>
              <td class="px-4 py-3 font-mono text-xs">{{ h.ip }}<span class="text-faint">:{{ h.poll_method === 'snmp' ? 161 : 10050 }}</span></td>
              <td class="px-4 py-3">
                <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium" :class="availClass(h)">{{ availLabel(h) }}</span>
              </td>
              <td class="px-4 py-3">{{ h.item_count }}</td>
              <td class="px-4 py-3">{{ h.trigger_count }}</td>
              <td class="px-4 py-3">
                <UBadge :color="h.problem_count > 0 ? 'error' : 'neutral'" variant="subtle" size="xs">{{ h.problem_count }}</UBadge>
              </td>
              <td class="px-4 py-3 text-right">
                <div class="flex justify-end gap-1">
                  <UButton :to="`/monitoring/server/hosts/${h.id}`" size="xs" variant="ghost" color="neutral" icon="i-lucide-chart-line" aria-label="Metrics" />
                  <template v-if="canManage">
                    <UButton size="xs" variant="ghost" color="neutral" :icon="h.monitoring_enabled === false ? 'i-lucide-play' : 'i-lucide-pause'" :aria-label="h.monitoring_enabled === false ? 'Resume' : 'Pause'" @click="togglePause(h)" />
                    <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-pencil" aria-label="Edit" @click="openEdit(h)" />
                    <UButton size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" aria-label="Delete" @click="deleteTarget = h" />
                  </template>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <UModal v-model:open="open" :title="editing ? 'Edit host' : 'Create host'" :ui="{ content: 'max-w-2xl' }">
      <template #body>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Host name" required><UInput v-model="form.name" class="w-full" placeholder="web-front-01" /></UFormField>
          <UFormField label="IP / DNS" required><UInput v-model="form.ip" class="w-full" placeholder="10.0.1.10" /></UFormField>
          <UFormField label="OS"><UInput v-model="form.os" class="w-full" placeholder="Ubuntu 22.04" /></UFormField>
          <UFormField label="Poll method"><USelect v-model="form.poll_method" :items="pollMethods" value-key="value" label-key="label" class="w-full" /></UFormField>
          <UFormField label="Groups" class="sm:col-span-2">
            <USelectMenu v-model="form.group_ids" :items="groupItems" value-key="value" label-key="label" multiple class="w-full" placeholder="Select groups" />
          </UFormField>
          <UFormField label="Templates" class="sm:col-span-2">
            <USelectMenu v-model="form.template_ids" :items="templateItems" value-key="value" label-key="label" multiple class="w-full" placeholder="Link templates (provision items + triggers)" />
          </UFormField>
          <UFormField label="Description" class="sm:col-span-2"><UTextarea v-model="form.description" class="w-full" :rows="2" /></UFormField>

          <template v-if="form.poll_method === 'snmp'">
            <div class="sm:col-span-2 border-t border-hull pt-3 text-xs font-semibold uppercase text-faint">SNMP</div>
            <NetSnmpFields :form="form" />
          </template>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="open = false">Cancel</UButton>
          <UButton color="primary" :loading="saving" @click="save">{{ editing ? 'Save' : 'Create' }}</UButton>
        </div>
      </template>
    </UModal>

    <UModal :open="!!deleteTarget" title="Delete host" @update:open="(v: boolean) => { if (!v) deleteTarget = null }">
      <template #body>
        <p class="text-sm text-(--color-muted)">Delete <span class="font-medium text-foam">{{ deleteTarget?.name }}</span> and all its items, triggers and history?</p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="deleteTarget = null">Cancel</UButton>
          <UButton color="error" @click="confirmDelete">Delete</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
