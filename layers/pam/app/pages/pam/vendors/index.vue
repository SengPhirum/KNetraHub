<script setup lang="ts">
// External vendor access (spec §10) — vendor organizations, one-time email
// invitations (token shown once), and manual suspension. Access is enforced
// server-side by contract window, status and source network.
const toast = useToast()
const { canManageVendors, statusBadge, shortTime } = usePam()
const { data, status, error, refresh } = useAsyncData('pamVendors',
  () => $fetch<{ organizations: any[] }>('/api/pam/v1/vendors/organizations').then(r => r.organizations), { server: false, default: () => [] })

const showCreate = ref(false)
const creating = ref(false)
const form = reactive({ name: '', sponsor: '', contract_start: '', contract_end: '', allowed_networks: '' })
async function create() {
  creating.value = true
  try {
    await $fetch('/api/pam/v1/vendors/organizations', { method: 'POST', body: {
      name: form.name, sponsor: form.sponsor || null, contract_start: form.contract_start || null, contract_end: form.contract_end || null,
      allowed_networks: form.allowed_networks ? form.allowed_networks.split(',').map(s => s.trim()).filter(Boolean) : null
    } })
    toast.add({ title: 'Vendor organization created', color: 'success' })
    showCreate.value = false
    Object.assign(form, { name: '', sponsor: '', contract_start: '', contract_end: '', allowed_networks: '' })
    await refresh()
  } catch (e: any) { toast.add({ title: 'Could not create', description: e?.data?.statusMessage, color: 'error' }) }
  finally { creating.value = false }
}

// Invite → one-time token dialog
const showInvite = ref(false)
const inviting = ref(false)
const inviteForm = reactive({ vendorId: '', email: '' })
const tokenOpen = ref(false)
const inviteToken = ref('')
watch(tokenOpen, (o) => { if (!o) inviteToken.value = '' })
function openInvite(org: any) { inviteForm.vendorId = org.id; inviteForm.email = ''; showInvite.value = true }
async function sendInvite() {
  inviting.value = true
  try {
    const res: any = await $fetch('/api/pam/v1/vendors/invitations', { method: 'POST', body: { vendor_id: inviteForm.vendorId, email: inviteForm.email } })
    inviteToken.value = res.token
    showInvite.value = false
    tokenOpen.value = true
  } catch (e: any) { toast.add({ title: 'Could not invite', description: e?.data?.statusMessage, color: 'error' }) }
  finally { inviting.value = false }
}

async function suspend(org: any) {
  try {
    await $fetch(`/api/pam/v1/vendors/organizations/${org.id}/suspend`, { method: 'POST', body: { reason: 'suspended from console' } })
    toast.add({ title: `${org.name} suspended`, color: 'warning' })
    await refresh()
  } catch (e: any) { toast.add({ title: 'Could not suspend', description: e?.data?.statusMessage, color: 'error' }) }
}
</script>

<template>
  <div>
    <PageHeader title="Vendor access" subtitle="Third-party organizations &amp; time-boxed external access" icon="i-lucide-handshake">
      <template v-if="canManageVendors" #actions><UButton icon="i-lucide-plus" size="sm" @click="showCreate = true">New vendor</UButton></template>
    </PageHeader>
    <DataState :status="status" :error="error" :empty="!data?.length" empty-label="No vendor organizations." empty-icon="i-lucide-handshake">
      <div class="panel overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="text-xs uppercase text-faint"><tr><th class="px-3 py-2">Organization</th><th class="px-3 py-2">Sponsor</th><th class="px-3 py-2">Contract ends</th><th class="px-3 py-2">Networks</th><th class="px-3 py-2">Status</th><th class="px-3 py-2 text-right">Actions</th></tr></thead>
          <tbody class="divide-y divide-surface">
            <tr v-for="o in data" :key="o.id" class="hover:bg-surface-2/40">
              <td class="px-3 py-2 font-medium text-foam">{{ o.name }}<span v-if="o.user_count != null" class="block text-xs text-faint">{{ o.user_count }} user(s)</span></td>
              <td class="px-3 py-2 text-(--color-muted)">{{ o.sponsor || '—' }}</td>
              <td class="px-3 py-2 text-xs text-faint">{{ o.contract_end ? o.contract_end.slice(0,10) : '—' }}</td>
              <td class="px-3 py-2 text-xs text-faint">{{ o.allowed_networks || 'any' }}</td>
              <td class="px-3 py-2"><span class="rounded px-1.5 py-0.5 text-xs" :class="statusBadge(o.status)">{{ o.status }}</span></td>
              <td class="px-3 py-2">
                <div v-if="canManageVendors" class="flex justify-end gap-1">
                  <UButton size="xs" variant="soft" icon="i-lucide-mail" @click="openInvite(o)">Invite</UButton>
                  <UButton v-if="o.status === 'active'" size="xs" color="warning" variant="ghost" icon="i-lucide-ban" @click="suspend(o)">Suspend</UButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </DataState>

    <PamOneTimeSecretModal v-model:open="tokenOpen" title="Vendor invitation" label="invitation token" :value="inviteToken" />

    <UModal v-model:open="showCreate" title="New vendor organization">
      <template #body>
        <div class="space-y-3">
          <UFormField label="Name" required><UInput v-model="form.name" class="w-full" /></UFormField>
          <UFormField label="Sponsor (internal owner)"><UInput v-model="form.sponsor" class="w-full" /></UFormField>
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Contract start"><UInput v-model="form.contract_start" type="date" class="w-full" /></UFormField>
            <UFormField label="Contract end"><UInput v-model="form.contract_end" type="date" class="w-full" /></UFormField>
          </div>
          <UFormField label="Allowed source networks" hint="comma-separated CIDRs"><UInput v-model="form.allowed_networks" class="w-full" placeholder="10.0.0.0/8, 192.168.0.0/16" /></UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="showCreate = false">Cancel</UButton>
          <UButton :loading="creating" :disabled="!form.name" @click="create">Create</UButton>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="showInvite" title="Invite vendor user">
      <template #body>
        <UFormField label="Email" required><UInput v-model="inviteForm.email" type="email" class="w-full" placeholder="contractor@vendor.example" /></UFormField>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="showInvite = false">Cancel</UButton>
          <UButton :loading="inviting" :disabled="!inviteForm.email" @click="sendInvite">Send invitation</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
