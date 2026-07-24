<script setup lang="ts">
// Discovery sources (spec §7) — define where to scan for privileged accounts,
// test connectivity, and launch a scan (results land in the pending queue).
const toast = useToast()
const { can, shortTime, statusBadge } = usePam()
const canManage = computed(() => can('pam.discovery.manage'))
const canRun = computed(() => can('pam.discovery.run'))
const { data, status, error, refresh } = useAsyncData('pamDiscoverySources',
  () => $fetch<any>('/api/pam/v1/discovery/sources').then(r => r.sources ?? r), { server: false, default: () => [] })
const { data: accounts } = useAsyncData('pamDiscoveryCredAccounts',
  () => $fetch<any>('/api/pam/v1/accounts').then(r => r.accounts ?? r), { server: false, default: () => [] })

const TYPES = ['postgresql', 'mysql', 'mongodb', 'ldap', 'active_directory', 'linux-ssh']
const showCreate = ref(false)
const creating = ref(false)
const form = reactive({ name: '', source_type: 'postgresql', configText: '{\n  "host": "",\n  "port": 5432,\n  "database": "postgres"\n}', credential_account_id: '' })

async function create() {
  let config: any
  try { config = JSON.parse(form.configText || '{}') } catch { toast.add({ title: 'Config is not valid JSON', color: 'error' }); return }
  creating.value = true
  try {
    await $fetch('/api/pam/v1/discovery/sources', { method: 'POST', body: { name: form.name, source_type: form.source_type, config, credential_account_id: form.credential_account_id || null } })
    toast.add({ title: 'Source created', color: 'success' })
    showCreate.value = false
    await refresh()
  } catch (e: any) { toast.add({ title: 'Could not create', description: e?.data?.statusMessage, color: 'error' }) }
  finally { creating.value = false }
}

const busy = ref<string | null>(null)
async function test(s: any) {
  busy.value = s.id
  try { const r: any = await $fetch(`/api/pam/v1/discovery/sources/${s.id}/test`, { method: 'POST' }); toast.add({ title: r.ok ? 'Connectivity OK' : 'Test failed', description: r.detail || r.message, color: r.ok ? 'success' : 'warning' }) }
  catch (e: any) { toast.add({ title: 'Test failed', description: e?.data?.statusMessage, color: 'error' }) }
  finally { busy.value = null }
}
async function scan(s: any) {
  busy.value = s.id
  try { const r: any = await $fetch(`/api/pam/v1/discovery/sources/${s.id}/scan`, { method: 'POST' }); toast.add({ title: `Scan started`, description: r.runId ? `run ${String(r.runId).slice(0,8)}` : undefined, color: 'success' }); await refresh() }
  catch (e: any) { toast.add({ title: 'Could not scan', description: e?.data?.statusMessage, color: 'error' }) }
  finally { busy.value = null }
}
async function remove(s: any) {
  try { await $fetch(`/api/pam/v1/discovery/sources/${s.id}`, { method: 'DELETE' }); await refresh() }
  catch (e: any) { toast.add({ title: 'Could not delete', description: e?.data?.statusMessage, color: 'error' }) }
}
</script>

<template>
  <div>
    <PageHeader title="Discovery sources" subtitle="Where to scan for privileged accounts" icon="i-lucide-radar">
      <template #actions>
        <UButton to="/pam/discovery" size="sm" color="neutral" variant="soft" icon="i-lucide-inbox">Pending</UButton>
        <UButton to="/pam/discovery/rules" size="sm" color="neutral" variant="soft" icon="i-lucide-list-checks">Rules</UButton>
        <UButton v-if="canManage" size="sm" icon="i-lucide-plus" @click="showCreate = true">New source</UButton>
      </template>
    </PageHeader>
    <DataState :status="status" :error="error" :empty="!data?.length" empty-label="No discovery sources." empty-icon="i-lucide-radar">
      <div class="panel overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="text-xs uppercase text-faint"><tr><th class="px-3 py-2">Source</th><th class="px-3 py-2">Type</th><th class="px-3 py-2">Last run</th><th class="px-3 py-2">Status</th><th class="px-3 py-2 text-right">Actions</th></tr></thead>
          <tbody class="divide-y divide-surface">
            <tr v-for="s in data" :key="s.id" class="hover:bg-surface-2/40">
              <td class="px-3 py-2 font-medium text-foam">{{ s.name }}</td>
              <td class="px-3 py-2 text-xs text-(--color-muted)">{{ s.source_type }}</td>
              <td class="px-3 py-2 text-xs text-faint">{{ shortTime(s.last_run_at) }}</td>
              <td class="px-3 py-2"><span class="rounded px-1.5 py-0.5 text-xs" :class="statusBadge(s.enabled === false ? 'expired' : 'active')">{{ s.enabled === false ? 'disabled' : 'enabled' }}</span></td>
              <td class="px-3 py-2">
                <div class="flex justify-end gap-1">
                  <UButton v-if="canRun" size="xs" variant="ghost" :loading="busy===s.id" icon="i-lucide-plug-zap" @click="test(s)">Test</UButton>
                  <UButton v-if="canRun" size="xs" variant="soft" :loading="busy===s.id" icon="i-lucide-radar" @click="scan(s)">Scan</UButton>
                  <UButton v-if="canManage" size="xs" color="error" variant="ghost" icon="i-lucide-trash-2" @click="remove(s)" />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </DataState>

    <UModal v-model:open="showCreate" title="New discovery source">
      <template #body>
        <div class="space-y-3">
          <UFormField label="Name" required><UInput v-model="form.name" class="w-full" /></UFormField>
          <UFormField label="Type" required><USelect v-model="form.source_type" class="w-full" :items="TYPES" /></UFormField>
          <UFormField label="Credential account" hint="account whose credential authenticates the scan">
            <USelectMenu v-model="form.credential_account_id" class="w-full" value-key="value" :items="(accounts||[]).map((a:any)=>({label:`${a.name} (${a.username})`,value:a.id}))" />
          </UFormField>
          <UFormField label="Connection config (JSON)"><UTextarea v-model="form.configText" :rows="5" class="w-full font-mono text-xs" /></UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="showCreate = false">Cancel</UButton>
          <UButton :loading="creating" :disabled="!form.name" @click="create">Create</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
