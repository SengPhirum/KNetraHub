<script setup lang="ts">
// Privileged accounts — searchable, filterable inventory. Credentials are never
// listed; onboarding seals any initial credential via the vault.
const route = useRoute()
const toast = useToast()
const { canAddAccount } = usePam()

const q = ref('')
const statusFilter = ref(String(route.query.status || ''))
const safeFilter = ref(String(route.query.safeId || ''))

const { data: safes } = useAsyncData('pamSafesForAccounts', () => $fetch<any[]>('/api/pam/v1/safes'), { server: false, default: () => [] })
const { data: platforms } = useAsyncData('pamPlatformsForAccounts', () => $fetch<any[]>('/api/pam/v1/platforms'), { server: false, default: () => [] })

const params = computed(() => {
  const p: Record<string, string> = {}
  if (q.value) p.q = q.value
  if (statusFilter.value) p.status = statusFilter.value
  if (safeFilter.value) p.safeId = safeFilter.value
  return p
})
const { data, status, error, refresh } = useAsyncData('pamAccounts',
  () => $fetch<any>('/api/pam/v1/accounts', { params: params.value }),
  { server: false, default: () => ({ items: [], total: 0 }), watch: [params] })

const showCreate = ref(false)
const creating = ref(false)
const form = reactive({ safe_id: '', name: '', username: '', address: '', port: '', platform_id: '', account_type: 'generic', criticality: 'medium', auto_managed: false, credential: '' })

async function createAccount() {
  creating.value = true
  try {
    const body: any = { ...form, port: form.port ? Number(form.port) : undefined }
    if (!body.credential) delete body.credential
    await $fetch('/api/pam/v1/accounts', { method: 'POST', body })
    toast.add({ title: 'Account onboarded', color: 'success' })
    showCreate.value = false
    Object.assign(form, { safe_id: '', name: '', username: '', address: '', port: '', platform_id: '', account_type: 'generic', criticality: 'medium', auto_managed: false, credential: '' })
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Could not onboard account', description: e?.data?.statusMessage, color: 'error' })
  } finally { creating.value = false }
}
const critBadge = CRITICALITY_BADGE
</script>

<template>
  <div>
    <PageHeader title="Accounts" subtitle="Privileged accounts across your safes" icon="i-lucide-key-round">
      <template v-if="canAddAccount" #actions>
        <UButton icon="i-lucide-plus" size="sm" @click="showCreate = true">Onboard account</UButton>
      </template>
    </PageHeader>

    <div class="mb-3 flex flex-wrap items-center gap-2">
      <UInput v-model="q" icon="i-lucide-search" placeholder="Search name / username / address" class="w-64" />
      <USelect v-model="statusFilter" :items="[{label:'All statuses',value:''},{label:'Managed',value:'managed'},{label:'Unmanaged',value:'unmanaged'},{label:'Pending',value:'pending'},{label:'Failed',value:'failed'}]" class="w-44" />
      <USelect v-model="safeFilter" :items="[{label:'All safes',value:''},...(safes||[]).map(s=>({label:s.name,value:s.id}))]" class="w-48" />
      <span class="ml-auto text-xs text-faint">{{ data.total }} accounts</span>
    </div>

    <DataState :status="status" :error="error" :empty="!data.items.length" empty-label="No accounts match.">
      <div class="panel overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="text-xs uppercase text-faint">
            <tr><th class="px-3 py-2">Name</th><th class="px-3 py-2">Username</th><th class="px-3 py-2">Address</th><th class="px-3 py-2">Safe</th><th class="px-3 py-2">Platform</th><th class="px-3 py-2">Criticality</th><th class="px-3 py-2">Rotation</th></tr>
          </thead>
          <tbody class="divide-y divide-surface">
            <tr v-for="a in data.items" :key="a.id" class="cursor-pointer hover:bg-surface-2/40" @click="navigateTo(`/pam/accounts/${a.id}`)">
              <td class="px-3 py-2 font-medium text-foam">{{ a.name }}</td>
              <td class="px-3 py-2 font-mono text-xs text-(--color-muted)">{{ a.username }}</td>
              <td class="px-3 py-2 font-mono text-xs text-faint">{{ a.address || '—' }}</td>
              <td class="px-3 py-2 text-(--color-muted)">{{ a.safe_name }}</td>
              <td class="px-3 py-2 text-(--color-muted)">{{ a.platform_name || '—' }}</td>
              <td class="px-3 py-2"><span class="rounded px-1.5 py-0.5 text-xs" :class="critBadge[a.criticality]">{{ a.criticality }}</span></td>
              <td class="px-3 py-2"><span class="rounded px-1.5 py-0.5 text-xs" :class="rotationBadge(a.rotation_status)">{{ a.rotation_status }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </DataState>

    <UModal v-model:open="showCreate" title="Onboard privileged account">
      <template #body>
        <div class="space-y-3">
          <UFormField label="Safe" required><USelect v-model="form.safe_id" :items="(safes||[]).map(s=>({label:s.name,value:s.id}))" placeholder="Select a safe" /></UFormField>
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Name" required><UInput v-model="form.name" /></UFormField>
            <UFormField label="Username" required><UInput v-model="form.username" /></UFormField>
          </div>
          <div class="grid grid-cols-3 gap-3">
            <UFormField label="Address" class="col-span-2"><UInput v-model="form.address" placeholder="host or IP" /></UFormField>
            <UFormField label="Port"><UInput v-model="form.port" type="number" /></UFormField>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Platform"><USelect v-model="form.platform_id" :items="[{label:'(none)',value:''},...(platforms||[]).map(p=>({label:p.name,value:p.id}))]" /></UFormField>
            <UFormField label="Criticality"><USelect v-model="form.criticality" :items="['low','medium','high','critical']" /></UFormField>
          </div>
          <UFormField label="Initial credential" hint="sealed immediately; never shown again">
            <UInput v-model="form.credential" type="password" placeholder="optional" />
          </UFormField>
          <UCheckbox v-model="form.auto_managed" label="Automatically manage (scheduled rotation)" />
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="showCreate = false">Cancel</UButton>
          <UButton :loading="creating" :disabled="!form.safe_id || !form.name || !form.username" @click="createAccount">Onboard</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
