<script setup lang="ts">
// Global IP address list across all subnets, with status/subnet/text filters
// and inline add/edit/release. Reuses IpamAddressFormModal.
const { hasApp } = useAuth()
const { canCreate, canUpdate } = useIpam()
const toast = useToast()

const filters = reactive({ subnet_id: '', status: '', q: '' })
const query = computed(() => {
  const p = new URLSearchParams()
  if (filters.subnet_id) p.set('subnet_id', filters.subnet_id)
  if (filters.status) p.set('status', filters.status)
  if (filters.q) p.set('q', filters.q)
  return p.toString()
})

const { data: addresses, status, error, refresh } = useAsyncData('ipamAddresses',
  () => $fetch<any[]>(`/api/ipmgt/addresses${query.value ? '?' + query.value : ''}`),
  { server: false, default: () => [], watch: [query] })
const { data: subnets } = useAsyncData('ipamAddrSubnets', () => $fetch<any[]>('/api/ipmgt/subnets'), { server: false, default: () => [] })

const subnetItems = computed(() => [{ value: '', label: 'All subnets' }, ...(subnets.value || []).map((s: any) => ({ value: s.id, label: `${s.name} · ${s.network}` }))])
const statusItems = [{ value: '', label: 'All statuses' }, ...SELECTABLE_STATUSES.map((s) => ({ value: s, label: ipStatusMeta(s).label }))]

const formOpen = ref(false)
const editing = ref<any>(null)
function openCreate() { editing.value = null; formOpen.value = true }
function openEdit(a: any) { editing.value = a; formOpen.value = true }

const releaseTarget = ref<any>(null)
const releasing = ref(false)
async function confirmRelease() {
  if (!releaseTarget.value) return
  releasing.value = true
  try {
    await $fetch(`/api/ipmgt/addresses/${releaseTarget.value.id}`, { method: 'DELETE' })
    toast.add({ title: 'Address released', color: 'primary', icon: 'i-lucide-check' })
    releaseTarget.value = null
    await refresh()
  } catch (e: any) { toast.add({ title: 'Release failed', description: e?.data?.statusMessage, color: 'error' }) }
  finally { releasing.value = false }
}
</script>

<template>
  <div>
    <PageHeader title="IP Addresses" subtitle="All allocated, reserved and managed addresses" icon="i-lucide-list-ordered">
      <template v-if="hasApp('ipmgt') && canCreate" #actions>
        <UButton icon="i-lucide-plus" size="sm" @click="openCreate">Add address</UButton>
      </template>
    </PageHeader>

    <div v-if="!hasApp('ipmgt')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-IPMgt.</p>
    </div>

    <div v-else class="space-y-4">
      <div class="flex flex-wrap items-center gap-2">
        <USelect v-model="filters.subnet_id" :items="subnetItems" value-key="value" label-key="label" size="sm" class="w-56" />
        <USelect v-model="filters.status" :items="statusItems" value-key="value" label-key="label" size="sm" class="w-40" />
        <UInput v-model="filters.q" icon="i-lucide-search" size="sm" placeholder="Search IP, host, MAC, owner…" class="w-64" />
      </div>

      <DataState :status="status" :error="error" :empty="!addresses.length"
                 empty-label="No addresses match." empty-icon="i-lucide-list-ordered">
        <template #empty-action>
          <UButton v-if="canCreate" class="mt-3" icon="i-lucide-plus" size="sm" @click="openCreate">Add address</UButton>
        </template>
        <div class="panel overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="bg-surface-2 text-xs uppercase text-faint">
              <tr>
                <th class="px-4 py-3 font-medium">Address</th>
                <th class="px-4 py-3 font-medium">Hostname</th>
                <th class="px-4 py-3 font-medium">Subnet</th>
                <th class="px-4 py-3 font-medium">Status</th>
                <th class="px-4 py-3 font-medium">Owner</th>
                <th class="px-4 py-3 font-medium">MAC</th>
                <th class="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-surface">
              <tr v-for="a in addresses" :key="a.id" class="hover:bg-surface-2/40">
                <td class="px-4 py-3 font-mono text-foam">{{ a.ip }}</td>
                <td class="px-4 py-3 text-(--color-muted)">{{ a.hostname || '—' }}</td>
                <td class="px-4 py-3">
                  <NuxtLink :to="`/ipmgt/subnets/${a.subnet_id}`" class="text-beacon hover:underline">{{ a.subnet_network || '—' }}</NuxtLink>
                </td>
                <td class="px-4 py-3"><IpamIpStatusBadge :status="a.status" /></td>
                <td class="px-4 py-3 text-(--color-muted)">{{ a.owner || '—' }}</td>
                <td class="px-4 py-3 font-mono text-xs text-faint">{{ a.mac || '—' }}</td>
                <td class="px-4 py-3">
                  <div class="flex items-center justify-end gap-1">
                    <UButton v-if="canUpdate" size="xs" variant="ghost" icon="i-lucide-pencil" aria-label="Edit" @click="openEdit(a)" />
                    <UButton v-if="canUpdate" size="xs" variant="ghost" color="error" icon="i-lucide-x" aria-label="Release" @click="releaseTarget = a" />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </DataState>
    </div>

    <IpamAddressFormModal v-model:open="formOpen" :address="editing" @saved="refresh" />

    <UModal :open="!!releaseTarget" @update:open="(v: boolean) => { if (!v) releaseTarget = null }" title="Release address">
      <template #body>
        <p class="text-sm text-(--color-muted)">Release <span class="font-mono text-foam">{{ releaseTarget?.ip }}</span>? It becomes free again.</p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-3">
          <UButton variant="ghost" @click="releaseTarget = null">Cancel</UButton>
          <UButton color="error" :loading="releasing" @click="confirmRelease">Release</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
