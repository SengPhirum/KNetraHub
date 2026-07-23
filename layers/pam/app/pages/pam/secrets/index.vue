<script setup lang="ts">
// Application/workload secrets — metadata list, create, and guarded reveal.
const toast = useToast()
const { canManageSecrets, shortTime } = usePam()
const { data, status, error, refresh } = useAsyncData('pamSecrets',
  () => $fetch<any[]>('/api/pam/v1/secrets'), { server: false, default: () => [] })
const { data: safes } = useAsyncData('pamSecretSafes', () => $fetch<any[]>('/api/pam/v1/safes'), { server: false, default: () => [] })

const showCreate = ref(false)
const creating = ref(false)
const form = reactive({ name: '', path: '', secret_type: 'kv', environment: '', value: '', generate: false, safe_id: '' })
async function create() {
  creating.value = true
  try {
    await $fetch('/api/pam/v1/secrets', { method: 'POST', body: { ...form } })
    toast.add({ title: 'Secret created', color: 'success' })
    showCreate.value = false
    await refresh()
  } catch (e: any) { toast.add({ title: 'Could not create', description: e?.data?.statusMessage, color: 'error' }) }
  finally { creating.value = false }
}

const revealed = ref<Record<string, string>>({})
async function reveal(s: any) {
  const reason = prompt('Reason for revealing this secret?')
  if (!reason) return
  try {
    const res: any = await $fetch(`/api/pam/v1/secrets/${s.id}/reveal`, { method: 'POST', body: { reason } })
    revealed.value = { ...revealed.value, [s.id]: res.value }
    setTimeout(() => { const { [s.id]: _, ...rest } = revealed.value; revealed.value = rest }, 30000)
  } catch (e: any) { toast.add({ title: 'Reveal denied', description: e?.data?.statusMessage, color: 'error' }) }
}
</script>

<template>
  <div>
    <PageHeader title="Secrets" subtitle="Application and workload secrets" icon="i-lucide-file-key-2">
      <template v-if="canManageSecrets" #actions><UButton icon="i-lucide-plus" size="sm" @click="showCreate = true">New secret</UButton></template>
    </PageHeader>
    <DataState :status="status" :error="error" :empty="!data?.length" empty-label="No secrets.">
      <div class="panel overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="text-xs uppercase text-faint"><tr><th class="px-3 py-2">Path</th><th class="px-3 py-2">Type</th><th class="px-3 py-2">Env</th><th class="px-3 py-2">Version</th><th class="px-3 py-2">Policies</th><th class="px-3 py-2"></th></tr></thead>
          <tbody class="divide-y divide-surface">
            <tr v-for="s in data" :key="s.id" class="hover:bg-surface-2/40">
              <td class="px-3 py-2"><span class="font-mono text-foam">{{ s.path }}</span><span class="block text-xs text-faint">{{ s.name }}</span>
                <span v-if="revealed[s.id]" class="mt-1 block select-all break-all rounded bg-amber-500/10 px-2 py-1 font-mono text-xs text-amber-300">{{ revealed[s.id] }}</span>
              </td>
              <td class="px-3 py-2 text-(--color-muted)">{{ s.secret_type }}</td>
              <td class="px-3 py-2 text-(--color-muted)">{{ s.environment || '—' }}</td>
              <td class="px-3 py-2 text-xs text-faint">v{{ s.current_version }}</td>
              <td class="px-3 py-2 text-xs text-faint">{{ s.policy_count }}</td>
              <td class="px-3 py-2 text-right"><UButton size="xs" color="warning" variant="ghost" icon="i-lucide-eye" @click="reveal(s)">Reveal</UButton></td>
            </tr>
          </tbody>
        </table>
      </div>
    </DataState>

    <UModal v-model:open="showCreate" title="New secret">
      <template #body>
        <div class="space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Name" required><UInput v-model="form.name" /></UFormField>
            <UFormField label="Path" required><UInput v-model="form.path" placeholder="app/prod/db" /></UFormField>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Type"><USelect v-model="form.secret_type" :items="['kv','json','db_credential','api_token','certificate','ssh_key','cloud_credential','password']" /></UFormField>
            <UFormField label="Safe"><USelect v-model="form.safe_id" :items="[{label:'(none)',value:''},...(safes||[]).map(s=>({label:s.name,value:s.id}))]" /></UFormField>
          </div>
          <UFormField label="Value" hint="sealed immediately"><UInput v-model="form.value" type="password" :disabled="form.generate" /></UFormField>
          <UCheckbox v-model="form.generate" label="Generate a strong random value instead" />
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="showCreate = false">Cancel</UButton>
          <UButton :loading="creating" :disabled="!form.name || !form.path" @click="create">Create</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
