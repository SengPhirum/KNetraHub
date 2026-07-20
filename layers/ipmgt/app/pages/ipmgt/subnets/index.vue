<script setup lang="ts">
// Subnets list: filter by section/version/text, live usage bars, create/edit/
// delete. Reuses IpamSubnetFormModal for the form.
const { hasApp } = useAuth()
const { canCreate, canUpdate, canDelete } = useIpam()
const route = useRoute()
const toast = useToast()

const filters = reactive({
  section_id: (route.query.section_id as string) || '',
  version: '',
  q: ''
})

const query = computed(() => {
  const p = new URLSearchParams()
  if (filters.section_id) p.set('section_id', filters.section_id)
  if (filters.version) p.set('version', filters.version)
  if (filters.q) p.set('q', filters.q)
  return p.toString()
})

const { data: subnets, status, error, refresh } = useAsyncData('ipamSubnetsList',
  () => $fetch<any[]>(`/api/ipmgt/subnets${query.value ? '?' + query.value : ''}`),
  { server: false, default: () => [], watch: [query] })

const { data: sections } = useAsyncData('ipamSubnetsSections', () => $fetch<any[]>('/api/ipmgt/sections'), { server: false, default: () => [] })
const sectionItems = computed(() => [{ value: '', label: 'All sections' }, ...(sections.value || []).map((s: any) => ({ value: s.id, label: s.name }))])
const versionItems = [{ value: '', label: 'All' }, { value: '4', label: 'IPv4' }, { value: '6', label: 'IPv6' }]

const formOpen = ref(false)
const editing = ref<any>(null)
function openCreate() { editing.value = null; formOpen.value = true }
function openEdit(s: any) { editing.value = s; formOpen.value = true }

const deleteTarget = ref<any>(null)
async function confirmDelete(headers: Record<string, string>) {
  if (!deleteTarget.value) return
  const force = !!deleteTarget.value?.usage?.used
  await $fetch(`/api/ipmgt/subnets/${deleteTarget.value.id}${force ? '?force=true' : ''}`, { method: 'DELETE', headers })
  toast.add({ title: 'Subnet deleted', color: 'primary', icon: 'i-lucide-check' })
  deleteTarget.value = null
  await refresh()
}
</script>

<template>
  <div>
    <PageHeader title="Subnets" subtitle="IPv4 and IPv6 managed subnets" icon="i-lucide-network">
      <template v-if="hasApp('ipmgt') && canCreate" #actions>
        <UButton icon="i-lucide-plus" size="sm" @click="openCreate">Add subnet</UButton>
      </template>
    </PageHeader>

    <div v-if="!hasApp('ipmgt')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-IPMgt.</p>
    </div>

    <div v-else class="space-y-4">
      <div class="flex flex-wrap items-center gap-2">
        <USelect v-model="filters.section_id" :items="sectionItems" value-key="value" label-key="label" size="sm" class="w-44" />
        <USelect v-model="filters.version" :items="versionItems" value-key="value" label-key="label" size="sm" class="w-28" />
        <UInput v-model="filters.q" icon="i-lucide-search" size="sm" placeholder="Search name or CIDR…" class="w-56" />
      </div>

      <DataState :status="status" :error="error" :empty="!subnets.length"
                 empty-label="No subnets match. Add one to get started." empty-icon="i-lucide-network">
        <template #empty-action>
          <UButton v-if="canCreate" class="mt-3" icon="i-lucide-plus" size="sm" @click="openCreate">Add subnet</UButton>
        </template>
        <div class="panel overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="bg-surface-2 text-xs uppercase text-faint">
              <tr>
                <th class="px-4 py-3 font-medium">Subnet</th>
                <th class="px-4 py-3 font-medium">Name</th>
                <th class="px-4 py-3 font-medium">Section</th>
                <th class="px-4 py-3 font-medium">VLAN</th>
                <th class="px-4 py-3 font-medium">VRF</th>
                <th class="px-4 py-3 font-medium min-w-[200px]">Usage</th>
                <th class="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-surface">
              <tr v-for="s in subnets" :key="s.id" class="hover:bg-surface-2/40">
                <td class="px-4 py-3">
                  <NuxtLink :to="`/ipmgt/subnets/${s.id}`" class="font-mono font-medium text-foam hover:text-beacon">{{ s.network }}</NuxtLink>
                  <UBadge v-if="s.version === 6" color="info" variant="subtle" size="xs" class="ml-2">v6</UBadge>
                </td>
                <td class="px-4 py-3 text-(--color-muted)">{{ s.name }}</td>
                <td class="px-4 py-3 text-(--color-muted)">{{ s.section_name || '—' }}</td>
                <td class="px-4 py-3 text-(--color-muted)">{{ s.vlan_number ? `${s.vlan_number}` : '—' }}</td>
                <td class="px-4 py-3 text-(--color-muted)">{{ s.vrf_name || '—' }}</td>
                <td class="px-4 py-3">
                  <div class="flex items-center gap-3">
                    <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                      <div class="h-full rounded-full" :class="usageBarClass(s.usage?.percent || 0)" :style="{ width: `${s.usage?.percent || 0}%` }" />
                    </div>
                    <span class="w-16 text-right text-xs text-faint">{{ s.usage?.used || 0 }}/{{ s.usage?.capacity || 0 }}</span>
                  </div>
                </td>
                <td class="px-4 py-3">
                  <div class="flex items-center justify-end gap-1">
                    <UButton size="xs" variant="ghost" icon="i-lucide-eye" :to="`/ipmgt/subnets/${s.id}`" aria-label="View" />
                    <UButton v-if="canUpdate" size="xs" variant="ghost" icon="i-lucide-pencil" aria-label="Edit" @click="openEdit(s)" />
                    <UButton v-if="canDelete" size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" aria-label="Delete" @click="deleteTarget = s" />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </DataState>
    </div>

    <IpamSubnetFormModal v-model:open="formOpen" :subnet="editing" :preset-section-id="filters.section_id || null" @saved="refresh" />

    <ConfirmDeleteModal
      type="ipmgt.subnet"
      :item-name="deleteTarget?.network"
      :open="!!deleteTarget"
      @update:open="(v: boolean) => { if (!v) deleteTarget = null }"
      title="Delete subnet"
      :message="deleteTarget
        ? `Subnet ${deleteTarget.network}${deleteTarget.usage?.used ? ` and all ${deleteTarget.usage.used} address(es) in it` : ''} will be permanently removed.`
        : ''"
      confirm-label="Delete subnet"
      :action="confirmDelete"
    />
  </div>
</template>
