<script setup lang="ts">
// Devices list: filter by type/status/location/customer/text, create/edit/
// delete. Reuses IpamDeviceFormModal for the form.
const { hasApp } = useAuth()
const { canCreate, canUpdate, canDelete } = useIpam()
const toast = useToast()

const filters = reactive({ device_type: '', status: '', location_id: '', customer_id: '', q: '' })

const query = computed(() => {
  const p = new URLSearchParams()
  if (filters.device_type) p.set('device_type', filters.device_type)
  if (filters.status) p.set('status', filters.status)
  if (filters.location_id) p.set('location_id', filters.location_id)
  if (filters.customer_id) p.set('customer_id', filters.customer_id)
  if (filters.q) p.set('q', filters.q)
  return p.toString()
})

const { data: devices, status, error, refresh } = useAsyncData('ipamDevicesList',
  () => $fetch<any[]>(`/api/ipmgt/devices${query.value ? '?' + query.value : ''}`),
  { server: false, default: () => [], watch: [query] })

const { data: locations } = useAsyncData('ipamDevicesLocations', () => $fetch<any[]>('/api/ipmgt/locations'), { server: false, default: () => [] })
const { data: customers } = useAsyncData('ipamDevicesCustomers', () => $fetch<any[]>('/api/ipmgt/customers'), { server: false, default: () => [] })

const typeItems = computed(() => [{ value: '', label: 'All types' }, ...IPAM_DEVICE_TYPE_ITEMS])
const statusItems = computed(() => [{ value: '', label: 'All statuses' }, ...IPAM_DEVICE_STATUS_ITEMS])
const locationItems = computed(() => [{ value: '', label: 'All locations' }, ...(locations.value || []).map((l: any) => ({ value: l.id, label: l.name }))])
const customerItems = computed(() => [{ value: '', label: 'All customers' }, ...(customers.value || []).map((c: any) => ({ value: c.id, label: c.name }))])

const formOpen = ref(false)
const editing = ref<any>(null)
function openCreate() { editing.value = null; formOpen.value = true }
function openEdit(d: any) { editing.value = d; formOpen.value = true }

const deleteTarget = ref<any | null>(null)
async function confirmDelete(headers: Record<string, string>) {
  const d = deleteTarget.value
  if (!d) return
  await $fetch(`/api/ipmgt/devices/${d.id}`, { method: 'DELETE', headers })
  toast.add({ title: 'Device deleted', color: 'primary', icon: 'i-lucide-check' })
  deleteTarget.value = null
  await refresh()
}

function statusClass(s: string) {
  return s === 'active' ? 'text-emerald-400' : s === 'maintenance' ? 'text-amber-400' : 'text-faint'
}

const testingId = ref<string | null>(null)
async function testSnmp(d: any) {
  testingId.value = d.id
  try {
    const res = await $fetch<any>(`/api/ipmgt/devices/${d.id}/snmp-test`, { method: 'POST' })
    toast.add({ title: `SNMP OK: ${res.sysName || d.hostname}`, description: res.sysDescr, color: 'primary', icon: 'i-lucide-check' })
  } catch (e: any) { toast.add({ title: 'SNMP test failed', description: e?.data?.statusMessage, color: 'error' }) }
  finally { testingId.value = null }
}

const discoveringId = ref<string | null>(null)
async function discoverSnmp(d: any) {
  discoveringId.value = d.id
  try {
    const res = await $fetch<any>(`/api/ipmgt/devices/${d.id}/snmp-discover`, { method: 'POST' })
    toast.add({ title: `SNMP discovery: ${res.created} new, ${res.updated} updated`, description: `${res.matched}/${res.entries} ARP entries matched a known subnet`, color: 'primary', icon: 'i-lucide-check' })
    await refresh()
  } catch (e: any) { toast.add({ title: 'SNMP discovery failed', description: e?.data?.statusMessage, color: 'error' }) }
  finally { discoveringId.value = null }
}
</script>

<template>
  <div>
    <PageHeader title="Devices" subtitle="Network device inventory linked to locations and customers" icon="i-lucide-server">
      <template v-if="hasApp('ipmgt') && canCreate" #actions>
        <UButton icon="i-lucide-plus" size="sm" @click="openCreate">Add Device</UButton>
      </template>
    </PageHeader>

    <div v-if="!hasApp('ipmgt')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-IPMgt.</p>
    </div>

    <div v-else class="space-y-4">
      <div class="flex flex-wrap items-center gap-2">
        <USelect v-model="filters.device_type" :items="typeItems" value-key="value" label-key="label" size="sm" class="w-40" />
        <USelect v-model="filters.status" :items="statusItems" value-key="value" label-key="label" size="sm" class="w-36" />
        <USelect v-model="filters.location_id" :items="locationItems" value-key="value" label-key="label" size="sm" class="w-44" />
        <USelect v-model="filters.customer_id" :items="customerItems" value-key="value" label-key="label" size="sm" class="w-44" />
        <UInput v-model="filters.q" icon="i-lucide-search" size="sm" placeholder="Search hostname, vendor, serial…" class="w-64" />
      </div>

      <DataState :status="status" :error="error" :empty="!devices.length"
                 empty-label="No devices match. Add one to get started." empty-icon="i-lucide-server">
        <template #empty-action>
          <UButton v-if="canCreate" class="mt-3" icon="i-lucide-plus" size="sm" @click="openCreate">Add Device</UButton>
        </template>
        <div class="panel overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="bg-surface-2 text-xs uppercase text-faint">
              <tr>
                <th class="px-4 py-3 font-medium">Hostname</th>
                <th class="px-4 py-3 font-medium">Type</th>
                <th class="px-4 py-3 font-medium">Vendor / Model</th>
                <th class="px-4 py-3 font-medium">Management IP</th>
                <th class="px-4 py-3 font-medium">Location</th>
                <th class="px-4 py-3 font-medium">Customer</th>
                <th class="px-4 py-3 font-medium">Status</th>
                <th class="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-surface">
              <tr v-for="d in devices" :key="d.id" class="hover:bg-surface-2/40">
                <td class="px-4 py-3">
                  <div class="font-medium text-foam">{{ d.hostname }}</div>
                  <div v-if="d.display_name" class="text-xs text-faint">{{ d.display_name }}</div>
                </td>
                <td class="px-4 py-3 text-(--color-muted)">
                  <span class="inline-flex items-center gap-1.5"><UIcon :name="ipamDeviceTypeIcon(d.device_type)" class="size-3.5" />{{ d.device_type || '—' }}</span>
                </td>
                <td class="px-4 py-3 text-(--color-muted)">{{ [d.vendor, d.model].filter(Boolean).join(' · ') || '—' }}</td>
                <td class="px-4 py-3 font-mono text-xs text-(--color-muted)">{{ d.management_ip || '—' }}</td>
                <td class="px-4 py-3 text-(--color-muted)">{{ d.location_name || '—' }}</td>
                <td class="px-4 py-3 text-(--color-muted)">{{ d.customer_name || '—' }}</td>
                <td class="px-4 py-3"><span class="text-xs capitalize" :class="statusClass(d.status)">{{ d.status }}</span></td>
                <td class="px-4 py-3">
                  <div class="flex items-center justify-end gap-1">
                    <UButton v-if="canUpdate && d.management_ip" size="xs" variant="ghost" icon="i-lucide-plug-zap" aria-label="Test SNMP" :loading="testingId === d.id" @click="testSnmp(d)" />
                    <UButton v-if="canUpdate && d.management_ip" size="xs" variant="ghost" icon="i-lucide-radar" aria-label="Discover via SNMP" :loading="discoveringId === d.id" @click="discoverSnmp(d)" />
                    <UButton v-if="canUpdate" size="xs" variant="ghost" icon="i-lucide-pencil" aria-label="Edit" @click="openEdit(d)" />
                    <UButton v-if="canDelete" size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" aria-label="Delete" @click="deleteTarget = d" />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </DataState>
    </div>

    <IpamDeviceFormModal v-model:open="formOpen" :device="editing" @saved="refresh" />

    <ConfirmDeleteModal
      type="ipmgt.device"
      :item-name="deleteTarget?.hostname"
      :open="!!deleteTarget"
      @update:open="(v: boolean) => { if (!v) deleteTarget = null }"
      title="Delete device"
      :message="deleteTarget ? `Device ${deleteTarget.hostname} will be permanently removed.` : ''"
      confirm-label="Delete"
      :action="confirmDelete"
    />
  </div>
</template>
