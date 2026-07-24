<script setup lang="ts">
// Just-in-time entitlements (spec §4.11) — request an ephemeral entitlement,
// provision it (verified), and revoke it (verified). Only the LDAP-group
// provider runs locally; cloud/Windows/k8s providers are EXTERNALLY CONSTRAINED
// and fail loudly rather than faking success.
const toast = useToast()
const { canViewJit, canManageJit, canRequest, statusBadge, shortTime } = usePam()
const { data, status, error, refresh } = useAsyncData('pamJit',
  () => $fetch<{ entitlements: any[] }>('/api/pam/v1/jit').then(r => r.entitlements), { server: false, default: () => [] })

const typeItems = [
  { label: 'LDAP / AD group (local)', value: 'ldap_group' },
  { label: 'sudo (constrained)', value: 'sudo' },
  { label: 'Database role (constrained)', value: 'db_role' },
  { label: 'AWS role (constrained)', value: 'aws_role' },
  { label: 'Azure role (constrained)', value: 'azure_role' },
  { label: 'GCP role (constrained)', value: 'gcp_role' },
  { label: 'K8s RoleBinding (constrained)', value: 'k8s_rolebinding' }
]
const showReq = ref(false)
const working = ref(false)
const form = reactive({ entitlement_type: 'ldap_group', target: '', principal: '', ttlMinutes: 60, provision: true })
async function request() {
  working.value = true
  try {
    const res: any = await $fetch('/api/pam/v1/jit', { method: 'POST', body: {
      entitlement_type: form.entitlement_type, target: form.target, principal: form.principal, ttl_seconds: form.ttlMinutes * 60, provision: form.provision
    } })
    if (res.provision && res.provision.ok === false) toast.add({ title: 'Requested — provisioning did not complete', description: res.provision.error || res.provision.detail, color: 'warning' })
    else toast.add({ title: 'JIT entitlement requested', color: 'success' })
    showReq.value = false
    Object.assign(form, { entitlement_type: 'ldap_group', target: '', principal: '', ttlMinutes: 60, provision: true })
    await refresh()
  } catch (e: any) { toast.add({ title: 'Could not request', description: e?.data?.statusMessage, color: 'error' }) }
  finally { working.value = false }
}

const busy = ref<string | null>(null)
async function act(e: any, kind: 'provision' | 'revoke') {
  busy.value = e.id
  try {
    const res: any = await $fetch(`/api/pam/v1/jit/${e.id}/${kind}`, { method: 'POST' })
    if (res && res.ok === false) toast.add({ title: `${kind} did not complete`, description: res.error || res.detail, color: 'warning' })
    else toast.add({ title: `${kind} done`, color: 'success' })
    await refresh()
  } catch (err: any) { toast.add({ title: `Could not ${kind}`, description: err?.data?.statusMessage, color: 'error' }) }
  finally { busy.value = null }
}
const stateOf = (e: any) => (e.revoked ? 'revoked' : e.provisioned ? 'active' : 'pending')
</script>

<template>
  <div>
    <PageHeader title="Just-in-time access" subtitle="Ephemeral, auto-expiring entitlements — zero standing privilege" icon="i-lucide-timer">
      <template v-if="canRequest" #actions><UButton icon="i-lucide-plus" size="sm" @click="showReq = true">Request JIT</UButton></template>
    </PageHeader>
    <DataState :status="status" :error="error" :empty="!data?.length" empty-label="No JIT entitlements." empty-icon="i-lucide-timer">
      <div class="panel overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="text-xs uppercase text-faint"><tr><th class="px-3 py-2">Principal</th><th class="px-3 py-2">Type</th><th class="px-3 py-2">Target</th><th class="px-3 py-2">State</th><th class="px-3 py-2">Expires</th><th class="px-3 py-2 text-right">Actions</th></tr></thead>
          <tbody class="divide-y divide-surface">
            <tr v-for="e in data" :key="e.id" class="hover:bg-surface-2/40">
              <td class="px-3 py-2 text-foam">{{ e.principal }}</td>
              <td class="px-3 py-2 text-xs text-(--color-muted)">{{ e.entitlement_type }}</td>
              <td class="px-3 py-2 font-mono text-xs text-faint">{{ e.target }}</td>
              <td class="px-3 py-2"><span class="rounded px-1.5 py-0.5 text-xs" :class="statusBadge(stateOf(e))">{{ stateOf(e) }}</span><span v-if="e.revoke_status && e.revoke_status!=='pending' && e.revoke_status!=='revoked'" class="ml-1 text-xs text-rose-400">{{ e.revoke_status }}</span></td>
              <td class="px-3 py-2 text-xs text-faint">{{ shortTime(e.expires_at) }}</td>
              <td class="px-3 py-2">
                <div v-if="canManageJit" class="flex justify-end gap-1">
                  <UButton v-if="!e.provisioned && !e.revoked" size="xs" variant="soft" :loading="busy===e.id" icon="i-lucide-play" @click="act(e,'provision')">Provision</UButton>
                  <UButton v-if="e.provisioned && !e.revoked" size="xs" color="warning" variant="soft" :loading="busy===e.id" icon="i-lucide-square" @click="act(e,'revoke')">Revoke</UButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </DataState>

    <UModal v-model:open="showReq" title="Request JIT entitlement">
      <template #body>
        <div class="space-y-3">
          <UFormField label="Entitlement type" required><USelect v-model="form.entitlement_type" class="w-full" :items="typeItems" /></UFormField>
          <UFormField label="Target" required hint="e.g. LDAP group DN / role ARN"><UInput v-model="form.target" class="w-full" placeholder="cn=admins,ou=groups,dc=corp" /></UFormField>
          <UFormField label="Principal" required hint="who receives the entitlement"><UInput v-model="form.principal" class="w-full" /></UFormField>
          <UFormField label="TTL (minutes)"><UInput v-model.number="form.ttlMinutes" type="number" class="w-full" /></UFormField>
          <UCheckbox v-model="form.provision" label="Provision immediately (verified)" />
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="showReq = false">Cancel</UButton>
          <UButton :loading="working" :disabled="!form.target || !form.principal" @click="request">Request</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
