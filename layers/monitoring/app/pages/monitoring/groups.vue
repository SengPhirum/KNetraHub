<script setup lang="ts">
// Unified Groups: Network device groups (net_groups) and Server host groups
// (server_host_groups) are two different tables/APIs underneath, but they are
// the same idea — so they show in ONE list here, each row tagged with a `type`
// (Network/Server) instead of living on separate pages. Membership editing
// (which devices/hosts belong to a group) still uses each domain's own picker,
// since only Network groups support a search+checkbox membership editor here
// (Server host membership is edited from the host form, as before).
const { hasApp, hasPermission } = useAuth()
const toast = useToast()
const canManage = computed(() => hasPermission('monitoring.manage'))

const { data: netGroups, refresh: refreshNet } = useAsyncData('unifiedNetGroups', () => $fetch<any[]>('/api/net/groups'), { default: () => [], server: false })
const { data: srvGroups, refresh: refreshSrv } = useAsyncData('unifiedSrvGroups', () => $fetch<any[]>('/api/server/hostgroups'), { default: () => [], server: false })
const { data: devices } = useAsyncData('unifiedGroupDevices', () => $fetch<any[]>('/api/net/devices'), { default: () => [] })

async function refresh() { await Promise.all([refreshNet(), refreshSrv()]) }

// ── Export / Import: one combined file, each row tagged by `type` so a single
// upload can recreate both device groups and host groups. Membership isn't
// included (see file header) - only name/description round-trip.
async function exportGroups() {
  const [net, srv] = await Promise.all([
    $fetch<any[]>('/api/net/groups/export'),
    $fetch<any[]>('/api/server/hostgroups/export')
  ])
  const combined = [
    ...net.map((g) => ({ type: 'network', ...g })),
    ...srv.map((g) => ({ type: 'server', ...g }))
  ]
  downloadJson(exportFilename('groups', 'json'), combined)
}
const importing = ref(false)
async function importGroups() {
  const file = await pickAndReadFile('.json')
  if (!file) return
  importing.value = true
  try {
    const rows: any[] = JSON.parse(file.text)
    if (!Array.isArray(rows)) throw new Error('Expected a list of groups')
    const netRows = rows.filter((r) => r.type !== 'server')
    const srvRows = rows.filter((r) => r.type === 'server')
    const [netResult, srvResult] = await Promise.all([
      netRows.length ? $fetch<{ added: number; skipped: number }>('/api/net/groups/import', { method: 'POST', body: netRows }) : { added: 0, skipped: 0 },
      srvRows.length ? $fetch<{ added: number; skipped: number }>('/api/server/hostgroups/import', { method: 'POST', body: srvRows }) : { added: 0, skipped: 0 }
    ])
    const added = netResult.added + srvResult.added
    const skipped = netResult.skipped + srvResult.skipped
    toast.add({ title: `Imported ${added} group${added === 1 ? '' : 's'}`, description: skipped ? `${skipped} skipped (name already exists)` : undefined, color: added ? 'primary' : 'warning', icon: 'i-lucide-check' })
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Import failed', description: e?.data?.statusMessage || e?.message, color: 'error' })
  } finally {
    importing.value = false
  }
}

const typeFilter = ref<'all' | 'network' | 'server'>('all')
const rows = computed(() => {
  const net = (netGroups.value || []).map((g: any) => ({ ...g, type: 'network', count: Number(g.device_count) || 0 }))
  const srv = (srvGroups.value || []).map((g: any) => ({ ...g, type: 'server', count: Number(g.host_count) || 0 }))
  const merged = [...net, ...srv].sort((a, b) => a.name.localeCompare(b.name))
  return typeFilter.value === 'all' ? merged : merged.filter((g) => g.type === typeFilter.value)
})

// ── Create ────────────────────────────────────────────────────────────────
const createOpen = ref(false)
const createForm = reactive({ type: 'network' as 'network' | 'server', name: '', description: '' })
const typeItems = [{ value: 'network', label: 'Network device group' }, { value: 'server', label: 'Server host group' }]
const saving = ref(false)

function openCreate() { Object.assign(createForm, { type: 'network', name: '', description: '' }); createOpen.value = true }
async function createGroup() {
  if (!createForm.name.trim()) return
  saving.value = true
  try {
    const url = createForm.type === 'network' ? '/api/net/groups' : '/api/server/hostgroups'
    await $fetch(url, { method: 'POST', body: { name: createForm.name, description: createForm.description } })
    toast.add({ title: 'Group created', color: 'primary', icon: 'i-lucide-check' })
    createOpen.value = false
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    saving.value = false
  }
}

// ── Manage (edit + Network-only membership) ─────────────────────────────────
const manageOpen = ref(false)
const manageGroup = ref<any>(null)
const manageForm = reactive({ name: '', description: '' })
const memberIds = ref<Set<string>>(new Set())
const memberSearch = ref('')

const filteredDevices = computed(() => {
  const list = devices.value || []
  const s = memberSearch.value.toLowerCase().trim()
  if (!s) return list
  return list.filter((d: any) => d.hostname.toLowerCase().includes(s) || d.ip.includes(s))
})

async function openManage(group: any) {
  manageGroup.value = group
  manageForm.name = group.name
  manageForm.description = group.description || ''
  memberSearch.value = ''
  memberIds.value = new Set()
  manageOpen.value = true
  if (group.type === 'network') {
    const full = await $fetch<any>(`/api/net/groups/${group.id}`)
    memberIds.value = new Set(full.device_ids || [])
  }
}
function toggleMember(id: string) {
  const next = new Set(memberIds.value)
  next.has(id) ? next.delete(id) : next.add(id)
  memberIds.value = next
}
async function saveManage() {
  if (!manageGroup.value || !manageForm.name.trim()) return
  saving.value = true
  try {
    if (manageGroup.value.type === 'network') {
      await Promise.all([
        $fetch(`/api/net/groups/${manageGroup.value.id}`, { method: 'PUT', body: { ...manageForm } }),
        $fetch(`/api/net/groups/${manageGroup.value.id}/members`, { method: 'PUT', body: { device_ids: [...memberIds.value] } })
      ])
    } else {
      await $fetch(`/api/server/hostgroups/${manageGroup.value.id}`, { method: 'PUT', body: { ...manageForm } })
    }
    toast.add({ title: 'Group updated', color: 'primary', icon: 'i-lucide-check' })
    manageOpen.value = false
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    saving.value = false
  }
}

// ── Delete ────────────────────────────────────────────────────────────────
const deleteTarget = ref<any>(null)
const deleting = ref(false)
async function confirmDelete() {
  if (!deleteTarget.value) return
  deleting.value = true
  try {
    const url = deleteTarget.value.type === 'network' ? `/api/net/groups/${deleteTarget.value.id}` : `/api/server/hostgroups/${deleteTarget.value.id}`
    await $fetch(url, { method: 'DELETE' })
    toast.add({ title: 'Group deleted', color: 'primary', icon: 'i-lucide-check' })
    deleteTarget.value = null
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Delete failed', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader title="Groups" subtitle="Network device groups and Server host groups, in one place" icon="i-lucide-folder-tree">
      <template v-if="hasApp('monitoring')" #actions>
        <div class="flex items-center gap-2">
          <UButton icon="i-lucide-download" size="sm" color="neutral" variant="soft" :disabled="!rows.length" @click="exportGroups">Export</UButton>
          <template v-if="canManage">
            <UButton icon="i-lucide-upload" size="sm" color="neutral" variant="soft" :loading="importing" @click="importGroups">Import</UButton>
            <UButton icon="i-lucide-plus" size="sm" @click="openCreate">Create group</UButton>
          </template>
        </div>
      </template>
    </PageHeader>

    <div v-if="!hasApp('monitoring')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-Monitoring.</p>
    </div>

    <div v-else class="space-y-4">
      <div class="flex flex-wrap gap-1.5">
        <button v-for="t in (['all', 'network', 'server'] as const)" :key="t"
                class="rounded-lg px-2.5 py-1 text-xs font-medium capitalize transition-colors"
                :class="typeFilter === t ? 'bg-beacon/15 text-beacon ring-1 ring-inset ring-beacon/30' : 'text-(--color-muted) hover:bg-surface-2'"
                @click="typeFilter = t">{{ t }}</button>
      </div>

      <div v-if="!rows.length" class="panel flex flex-col items-center gap-2 p-10 text-center">
        <UIcon name="i-lucide-folder-plus" class="size-7 text-beacon" />
        <h2 class="font-display text-lg font-semibold text-foam">No groups yet</h2>
        <p class="max-w-md text-sm text-(--color-muted)">Create a group to organize devices or hosts (by site, role, or owner) and act on them together.</p>
        <UButton v-if="canManage" class="mt-2" icon="i-lucide-plus" size="sm" @click="openCreate">Create group</UButton>
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div v-for="g in rows" :key="`${g.type}:${g.id}`" class="panel p-5 flex flex-col">
          <div class="flex items-start justify-between mb-2">
            <div class="flex items-center gap-2">
              <h3 class="text-foam font-semibold">{{ g.name }}</h3>
              <UBadge :color="g.type === 'network' ? 'info' : 'primary'" variant="subtle" size="xs" class="capitalize">{{ g.type }}</UBadge>
            </div>
            <UIcon name="i-lucide-folder" class="size-5 text-(--color-muted)" />
          </div>
          <p class="text-sm text-(--color-muted) mb-4 min-h-10">{{ g.description || 'No description' }}</p>
          <div class="flex items-center justify-between mt-auto pt-4 border-t border-surface">
            <span class="text-xs text-faint font-medium uppercase">{{ g.count }} {{ g.type === 'network' ? 'Devices' : 'Hosts' }}</span>
            <div v-if="canManage" class="flex items-center gap-1">
              <UButton size="xs" variant="ghost" icon="i-lucide-settings-2" @click="openManage(g)">Manage</UButton>
              <UButton size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" aria-label="Delete group" @click="deleteTarget = g" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Create group -->
    <UModal v-model:open="createOpen" title="Create group">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Type">
            <USelect v-model="createForm.type" :items="typeItems" value-key="value" label-key="label" class="w-full" />
          </UFormField>
          <UFormField label="Name">
            <UInput v-model="createForm.name" placeholder="Core Switches" class="w-full" autofocus @keyup.enter="createGroup" />
          </UFormField>
          <UFormField label="Description">
            <UTextarea v-model="createForm.description" placeholder="What lives in this group?" class="w-full" :rows="2" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-3 w-full">
          <UButton variant="ghost" @click="createOpen = false">Cancel</UButton>
          <UButton color="primary" :loading="saving" :disabled="!createForm.name.trim()" @click="createGroup">Create</UButton>
        </div>
      </template>
    </UModal>

    <!-- Manage group -->
    <UModal v-model:open="manageOpen" title="Manage group" :ui="{ content: 'max-w-xl' }">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Name">
            <UInput v-model="manageForm.name" class="w-full" />
          </UFormField>
          <UFormField label="Description">
            <UTextarea v-model="manageForm.description" class="w-full" :rows="2" />
          </UFormField>
          <UFormField v-if="manageGroup?.type === 'network'" :label="`Members (${memberIds.size} selected)`">
            <UInput v-model="memberSearch" icon="i-lucide-search" placeholder="Search hostname or IP..." class="w-full mb-2" />
            <div class="max-h-64 overflow-y-auto rounded-lg border border-surface divide-y divide-surface">
              <div v-if="!filteredDevices.length" class="px-3 py-6 text-center text-xs text-faint">No devices.</div>
              <label
                v-for="dev in filteredDevices"
                :key="dev.id"
                class="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-surface-2/50 transition"
              >
                <UCheckbox :model-value="memberIds.has(dev.id)" @update:model-value="toggleMember(dev.id)" />
                <span class="size-2 rounded-full" :class="dev.status === 'up' ? 'bg-emerald-500' : dev.status === 'paused' ? 'bg-amber-500' : 'bg-rose-500'"></span>
                <span class="text-sm text-foam">{{ dev.hostname }}</span>
                <span class="font-mono text-xs text-faint ml-auto">{{ dev.ip }}</span>
              </label>
            </div>
          </UFormField>
          <p v-else class="text-xs text-faint">Host membership is set from each host's own form (Server &gt; Hosts &gt; Edit).</p>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-3 w-full">
          <UButton variant="ghost" @click="manageOpen = false">Cancel</UButton>
          <UButton color="primary" :loading="saving" :disabled="!manageForm.name.trim()" @click="saveManage">Save Changes</UButton>
        </div>
      </template>
    </UModal>

    <!-- Delete confirmation -->
    <UModal :open="!!deleteTarget" @update:open="(v: boolean) => { if (!v) deleteTarget = null }" title="Delete group">
      <template #body>
        <p class="text-sm text-(--color-muted)">
          Delete the group <span class="font-medium text-foam">{{ deleteTarget?.name }}</span>?
          The {{ deleteTarget?.type === 'network' ? 'devices' : 'hosts' }} in it are not affected — only the grouping is removed.
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
