<script setup lang="ts">
// Connector runners (spec §4 / §19) — out-of-process agents that execute
// signed connector bundles against targets the portal can't reach directly.
// Enrollment token is shown ONCE (only its SHA-256 is stored).
const toast = useToast()
const { can, shortTime, statusBadge } = usePam()
const canManage = computed(() => can('pam.connector.manage'))
const { data, status, error, refresh } = useAsyncData('pamRunners',
  () => $fetch<any>('/api/pam/v1/runners').then(r => r.runners ?? r), { server: false, default: () => [] })
const { data: connectors } = useAsyncData('pamRunnerConnectors',
  () => $fetch<any[]>('/api/pam/v1/connectors').then(r => (Array.isArray(r) ? r : (r as any).connectors ?? [])), { server: false, default: () => [] })
const connectorKeys = computed(() => (connectors.value || []).map((c: any) => c.connector_key || c.key).filter(Boolean))

const showCreate = ref(false)
const creating = ref(false)
const form = reactive<{ name: string; description: string; connectorAllowlist: string[]; maxConcurrentJobs: number }>({ name: '', description: '', connectorAllowlist: [], maxConcurrentJobs: 4 })
const tokenOpen = ref(false)
const enrollToken = ref('')
watch(tokenOpen, (o) => { if (!o) enrollToken.value = '' })

async function create() {
  creating.value = true
  try {
    const res: any = await $fetch('/api/pam/v1/runners', { method: 'POST', body: { ...form } })
    enrollToken.value = res.token
    showCreate.value = false
    Object.assign(form, { name: '', description: '', connectorAllowlist: [], maxConcurrentJobs: 4 })
    tokenOpen.value = true
    await refresh()
  } catch (e: any) { toast.add({ title: 'Could not create runner', description: e?.data?.statusMessage, color: 'error' }) }
  finally { creating.value = false }
}
async function rotate(r: any) {
  try {
    const res: any = await $fetch(`/api/pam/v1/runners/${r.id}/rotate`, { method: 'POST' })
    enrollToken.value = res.token; tokenOpen.value = true
    await refresh()
  } catch (e: any) { toast.add({ title: 'Could not rotate', description: e?.data?.statusMessage, color: 'error' }) }
}
async function remove(r: any) {
  try { await $fetch(`/api/pam/v1/runners/${r.id}`, { method: 'DELETE' }); toast.add({ title: 'Runner revoked', color: 'success' }); await refresh() }
  catch (e: any) { toast.add({ title: 'Could not revoke', description: e?.data?.statusMessage, color: 'error' }) }
}
</script>

<template>
  <div>
    <PageHeader title="Connector runners" subtitle="Out-of-process agents that run signed connector bundles" icon="i-lucide-server-cog">
      <template v-if="canManage" #actions><UButton icon="i-lucide-plus" size="sm" @click="showCreate = true">Enroll runner</UButton></template>
    </PageHeader>
    <DataState :status="status" :error="error" :empty="!data?.length" empty-label="No runners enrolled." empty-icon="i-lucide-server-cog">
      <div class="panel overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="text-xs uppercase text-faint"><tr><th class="px-3 py-2">Runner</th><th class="px-3 py-2">Token</th><th class="px-3 py-2">Allowlist</th><th class="px-3 py-2">Last seen</th><th class="px-3 py-2">Status</th><th class="px-3 py-2 text-right">Actions</th></tr></thead>
          <tbody class="divide-y divide-surface">
            <tr v-for="r in data" :key="r.id" class="hover:bg-surface-2/40">
              <td class="px-3 py-2 font-medium text-foam">{{ r.name }}<span v-if="r.description" class="block text-xs text-faint">{{ r.description }}</span></td>
              <td class="px-3 py-2 font-mono text-xs text-faint">{{ r.token_prefix || r.tokenPrefix }}…</td>
              <td class="px-3 py-2 text-xs text-(--color-muted)">{{ (r.connector_allowlist || r.connectorAllowlist || []).join(', ') || 'any' }}</td>
              <td class="px-3 py-2 text-xs text-faint">{{ shortTime(r.last_seen_at || r.lastSeenAt) }}</td>
              <td class="px-3 py-2"><span class="rounded px-1.5 py-0.5 text-xs" :class="statusBadge(r.revoked ? 'revoked' : (r.status || 'active'))">{{ r.revoked ? 'revoked' : (r.status || 'active') }}</span></td>
              <td class="px-3 py-2">
                <div v-if="canManage" class="flex justify-end gap-1">
                  <UButton size="xs" variant="soft" icon="i-lucide-refresh-cw" @click="rotate(r)">Rotate</UButton>
                  <UButton size="xs" color="error" variant="ghost" icon="i-lucide-trash-2" @click="remove(r)" />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </DataState>

    <PamOneTimeSecretModal v-model:open="tokenOpen" title="Runner enrollment token" label="runner token" :value="enrollToken" />

    <UModal v-model:open="showCreate" title="Enroll a runner">
      <template #body>
        <div class="space-y-3">
          <UFormField label="Name" required><UInput v-model="form.name" class="w-full" placeholder="dmz-runner-1" /></UFormField>
          <UFormField label="Description"><UInput v-model="form.description" class="w-full" /></UFormField>
          <UFormField label="Connector allowlist" hint="empty = any trusted connector">
            <USelectMenu v-model="form.connectorAllowlist" class="w-full" multiple :items="connectorKeys" />
          </UFormField>
          <UFormField label="Max concurrent jobs"><UInput v-model.number="form.maxConcurrentJobs" type="number" class="w-full" /></UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="showCreate = false">Cancel</UButton>
          <UButton :loading="creating" :disabled="!form.name" @click="create">Enroll</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
