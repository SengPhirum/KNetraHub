<script setup lang="ts">
// IP address requests: submit against any subnet with allow_requests enabled;
// managers approve (auto-allocates the IP) or reject.
const { hasApp, hasPermission, user } = useAuth()
const { canCreate } = useIpam()
const canApprove = computed(() => hasPermission('ipmgt.approve'))
const toast = useToast()

const filters = reactive({ status: '', mine: false })
const query = computed(() => {
  const p = new URLSearchParams()
  if (filters.status) p.set('status', filters.status)
  if (filters.mine) p.set('mine', 'true')
  return p.toString()
})
const { data: requests, status, error, refresh } = useAsyncData('ipamRequests',
  () => $fetch<any[]>(`/api/ipmgt/requests${query.value ? '?' + query.value : ''}`),
  { server: false, default: () => [], watch: [query] })

const { data: subnets } = useAsyncData('ipamRefSubnetsForRequest', () => $fetch<any[]>('/api/ipmgt/subnets'), { server: false, default: () => [] })
const requestableSubnets = computed(() => (subnets.value || []).filter((s: any) => s.allow_requests))
const subnetItems = computed(() => requestableSubnets.value.map((s: any) => ({ value: s.id, label: `${s.name} · ${s.network}` })))

const STATUS_ITEMS = [
  { value: '', label: 'All statuses' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' }
]
function statusClass(s: string) {
  return s === 'approved' ? 'text-emerald-400' : s === 'rejected' ? 'text-rose-400' : s === 'cancelled' ? 'text-faint' : 'text-amber-400'
}

const createOpen = ref(false)
const createForm = reactive({ subnet_id: '', requested_ip: '', hostname: '', mac: '', owner: '', description: '', justification: '' })
const saving = ref(false)
function openCreate() { Object.assign(createForm, { subnet_id: '', requested_ip: '', hostname: '', mac: '', owner: '', description: '', justification: '' }); createOpen.value = true }
async function submitRequest() {
  if (!createForm.subnet_id) { toast.add({ title: 'Select a subnet', color: 'error' }); return }
  saving.value = true
  try {
    await $fetch('/api/ipmgt/requests', { method: 'POST', body: createForm })
    toast.add({ title: 'Request submitted', color: 'primary', icon: 'i-lucide-check' })
    createOpen.value = false
    await refresh()
  } catch (e: any) { toast.add({ title: 'Submit failed', description: e?.data?.statusMessage, color: 'error' }) }
  finally { saving.value = false }
}

const decisionTarget = ref<any | null>(null)
const decisionAction = ref<'approve' | 'reject' | null>(null)
const adminComment = ref('')
const deciding = ref(false)
function openDecision(r: any, action: 'approve' | 'reject') { decisionTarget.value = r; decisionAction.value = action; adminComment.value = '' }
async function submitDecision() {
  if (!decisionTarget.value || !decisionAction.value) return
  deciding.value = true
  try {
    await $fetch(`/api/ipmgt/requests/${decisionTarget.value.id}/${decisionAction.value}`, { method: 'POST', body: { admin_comment: adminComment.value || undefined } })
    toast.add({ title: decisionAction.value === 'approve' ? 'Request approved' : 'Request rejected', color: 'primary', icon: 'i-lucide-check' })
    decisionTarget.value = null
    await refresh()
  } catch (e: any) { toast.add({ title: 'Action failed', description: e?.data?.statusMessage, color: 'error' }) }
  finally { deciding.value = false }
}

async function cancelRequest(r: any) {
  try {
    await $fetch(`/api/ipmgt/requests/${r.id}/cancel`, { method: 'POST' })
    toast.add({ title: 'Request cancelled', color: 'primary', icon: 'i-lucide-check' })
    await refresh()
  } catch (e: any) { toast.add({ title: 'Cancel failed', description: e?.data?.statusMessage, color: 'error' }) }
}
</script>

<template>
  <div>
    <PageHeader title="IP Requests" subtitle="Request, approve, and track address allocations" icon="i-lucide-inbox">
      <template v-if="hasApp('ipmgt') && canCreate" #actions>
        <UButton icon="i-lucide-plus" size="sm" @click="openCreate">New request</UButton>
      </template>
    </PageHeader>

    <div v-if="!hasApp('ipmgt')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-IPMgt.</p>
    </div>

    <div v-else class="space-y-4">
      <div class="flex flex-wrap items-center gap-2">
        <USelect v-model="filters.status" :items="STATUS_ITEMS" value-key="value" label-key="label" size="sm" class="w-40" />
        <UCheckbox v-model="filters.mine" label="My requests only" />
      </div>

      <DataState :status="status" :error="error" :empty="!requests.length" empty-label="No requests yet." empty-icon="i-lucide-inbox">
        <template #empty-action>
          <UButton v-if="canCreate" class="mt-3" icon="i-lucide-plus" size="sm" @click="openCreate">New request</UButton>
        </template>
        <div class="panel overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="bg-surface-2 text-xs uppercase text-faint">
              <tr>
                <th class="px-4 py-3 font-medium">Subnet</th>
                <th class="px-4 py-3 font-medium">Requested IP</th>
                <th class="px-4 py-3 font-medium">Hostname</th>
                <th class="px-4 py-3 font-medium">Requester</th>
                <th class="px-4 py-3 font-medium">Status</th>
                <th class="px-4 py-3 font-medium">Assigned</th>
                <th class="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-surface">
              <tr v-for="r in requests" :key="r.id" class="hover:bg-surface-2/40">
                <td class="px-4 py-3 font-mono text-xs text-foam">{{ r.subnet_network }} <span class="font-sans text-(--color-muted)">{{ r.subnet_name }}</span></td>
                <td class="px-4 py-3 font-mono text-xs text-(--color-muted)">{{ r.requested_ip || 'first free' }}</td>
                <td class="px-4 py-3 text-(--color-muted)">{{ r.hostname || '—' }}</td>
                <td class="px-4 py-3 text-(--color-muted)">{{ r.requester }}</td>
                <td class="px-4 py-3"><span class="text-xs capitalize" :class="statusClass(r.status)">{{ r.status }}</span></td>
                <td class="px-4 py-3 font-mono text-xs text-(--color-muted)">{{ r.assigned_ip || '—' }}</td>
                <td class="px-4 py-3">
                  <div class="flex items-center justify-end gap-1">
                    <template v-if="r.status === 'submitted'">
                      <UButton v-if="canApprove" size="xs" variant="ghost" color="primary" icon="i-lucide-check" aria-label="Approve" @click="openDecision(r, 'approve')" />
                      <UButton v-if="canApprove" size="xs" variant="ghost" color="error" icon="i-lucide-x" aria-label="Reject" @click="openDecision(r, 'reject')" />
                      <UButton v-if="r.requester === user?.username || canApprove" size="xs" variant="ghost" icon="i-lucide-ban" aria-label="Cancel" @click="cancelRequest(r)" />
                    </template>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </DataState>
    </div>

    <UModal v-model:open="createOpen" title="New IP request" :ui="{ content: 'max-w-2xl' }">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Subnet" required help="Only subnets with requests enabled are listed">
            <USelect v-model="createForm.subnet_id" :items="subnetItems" value-key="value" label-key="label" class="w-full" placeholder="Select subnet" />
          </UFormField>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Requested IP" help="Leave blank for first available">
              <UInput v-model="createForm.requested_ip" placeholder="10.0.1.10" class="w-full font-mono" />
            </UFormField>
            <UFormField label="Hostname">
              <UInput v-model="createForm.hostname" class="w-full" />
            </UFormField>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="MAC address">
              <UInput v-model="createForm.mac" class="w-full font-mono" />
            </UFormField>
            <UFormField label="Owner / team">
              <UInput v-model="createForm.owner" class="w-full" />
            </UFormField>
          </div>
          <UFormField label="Description">
            <UInput v-model="createForm.description" class="w-full" />
          </UFormField>
          <UFormField label="Business justification">
            <UTextarea v-model="createForm.justification" class="w-full" :rows="3" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-3">
          <UButton variant="ghost" @click="createOpen = false">Cancel</UButton>
          <UButton color="primary" :loading="saving" :disabled="!createForm.subnet_id" @click="submitRequest">Submit</UButton>
        </div>
      </template>
    </UModal>

    <UModal :open="!!decisionTarget" @update:open="(v: boolean) => { if (!v) decisionTarget = null }" :title="decisionAction === 'approve' ? 'Approve request' : 'Reject request'">
      <template #body>
        <div class="space-y-3">
          <p class="text-sm text-(--color-muted)">
            {{ decisionAction === 'approve' ? 'This allocates an address and marks the request fulfilled.' : 'This closes the request without allocating an address.' }}
          </p>
          <UFormField label="Comment (optional)">
            <UTextarea v-model="adminComment" class="w-full" :rows="2" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-3">
          <UButton variant="ghost" @click="decisionTarget = null">Cancel</UButton>
          <UButton :color="decisionAction === 'approve' ? 'primary' : 'error'" :loading="deciding" @click="submitDecision">
            {{ decisionAction === 'approve' ? 'Approve' : 'Reject' }}
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
