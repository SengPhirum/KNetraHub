<script setup lang="ts">
// Access-certification campaigns (spec §11). List campaigns with progress;
// create a campaign that snapshots a set of subjects for review.
const toast = useToast()
const { canManageCertifications, statusBadge, shortTime } = usePam()
const { data, status, error, refresh } = useAsyncData('pamCertifications',
  () => $fetch<any[]>('/api/pam/v1/certifications'), { server: false, default: () => [] })
const { data: safes } = useAsyncData('pamCertSafes', () => $fetch<any[]>('/api/pam/v1/safes'), { server: false, default: () => [] })

const scopeItems = [
  { label: 'Active grants', value: 'active_grants' },
  { label: 'Privileged accounts', value: 'privileged_accounts' },
  { label: 'Live JIT entitlements', value: 'jit_entitlements' },
  { label: 'Safe members', value: 'safe_members' }
]
const showCreate = ref(false)
const creating = ref(false)
const form = reactive({ name: '', scopeType: 'active_grants', safeId: '', reviewer: '', dueDate: '' })

async function create() {
  creating.value = true
  try {
    const scope: any = { type: form.scopeType }
    if (form.scopeType === 'safe_members') scope.safeId = form.safeId
    const res: any = await $fetch('/api/pam/v1/certifications', { method: 'POST', body: { name: form.name, scope, reviewer: form.reviewer || null, due_date: form.dueDate || null } })
    toast.add({ title: `Campaign created — ${res.itemCount} items to review`, color: 'success' })
    showCreate.value = false
    Object.assign(form, { name: '', scopeType: 'active_grants', safeId: '', reviewer: '', dueDate: '' })
    await refresh()
  } catch (e: any) { toast.add({ title: 'Could not create campaign', description: e?.data?.statusMessage, color: 'error' }) }
  finally { creating.value = false }
}
const decided = (c: any) => (c.certified || 0) + (c.revoked || 0) + (c.delegated || 0)
</script>

<template>
  <div>
    <PageHeader title="Access certification" subtitle="Periodic review &amp; attestation of privileged access" icon="i-lucide-clipboard-check">
      <template v-if="canManageCertifications" #actions><UButton icon="i-lucide-plus" size="sm" @click="showCreate = true">New campaign</UButton></template>
    </PageHeader>
    <DataState :status="status" :error="error" :empty="!data?.length" empty-label="No certification campaigns yet." empty-icon="i-lucide-clipboard-check">
      <div class="panel overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="text-xs uppercase text-faint"><tr><th class="px-3 py-2">Campaign</th><th class="px-3 py-2">Scope</th><th class="px-3 py-2">Reviewer</th><th class="px-3 py-2">Due</th><th class="px-3 py-2">Progress</th><th class="px-3 py-2">Status</th></tr></thead>
          <tbody class="divide-y divide-surface">
            <tr v-for="c in data" :key="c.id" class="cursor-pointer hover:bg-surface-2/40" @click="navigateTo(`/pam/certifications/${c.id}`)">
              <td class="px-3 py-2 font-medium text-foam">{{ c.name }}<span class="block text-xs text-faint">{{ shortTime(c.created_at) }}</span></td>
              <td class="px-3 py-2 text-(--color-muted)">{{ (()=>{ try { return JSON.parse(c.scope)?.type } catch { return c.scope } })() }}</td>
              <td class="px-3 py-2 text-(--color-muted)">{{ c.reviewer || '—' }}</td>
              <td class="px-3 py-2 text-xs text-faint">{{ c.due_date ? c.due_date.slice(0,10) : '—' }}</td>
              <td class="px-3 py-2 text-xs">{{ decided(c) }}/{{ c.total || 0 }}<span v-if="c.revoked" class="ml-1 text-rose-400">({{ c.revoked }} revoked)</span></td>
              <td class="px-3 py-2"><span class="rounded px-1.5 py-0.5 text-xs" :class="statusBadge(c.status)">{{ c.status }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </DataState>

    <UModal v-model:open="showCreate" title="New certification campaign">
      <template #body>
        <div class="space-y-3">
          <UFormField label="Name" required><UInput v-model="form.name" class="w-full" placeholder="Q3 privileged access review" /></UFormField>
          <UFormField label="Scope" required><USelect v-model="form.scopeType" class="w-full" :items="scopeItems" /></UFormField>
          <UFormField v-if="form.scopeType === 'safe_members'" label="Safe" required>
            <USelectMenu v-model="form.safeId" class="w-full" :items="(safes||[]).map(s=>({label:s.name,value:s.id}))" value-key="value" />
          </UFormField>
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Reviewer"><UInput v-model="form.reviewer" class="w-full" placeholder="username / team" /></UFormField>
            <UFormField label="Due date"><UInput v-model="form.dueDate" type="date" class="w-full" /></UFormField>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="showCreate = false">Cancel</UButton>
          <UButton :loading="creating" :disabled="!form.name || (form.scopeType==='safe_members' && !form.safeId)" @click="create">Create</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
