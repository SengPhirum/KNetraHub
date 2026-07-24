<script setup lang="ts">
// Application/workload secrets — metadata list, create, and guarded reveal.
// Reveal goes through the shared <PamRevealModal>: no browser dialog, no
// plaintext rendered into the table, auto-hide countdown, copy control, step-up.
const toast = useToast()
const { canManageSecrets, canUseSecrets, shortTime } = usePam()
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
    Object.assign(form, { name: '', path: '', secret_type: 'kv', environment: '', value: '', generate: false, safe_id: '' })
    await refresh()
  } catch (e: any) { toast.add({ title: 'Could not create', description: e?.data?.statusMessage, color: 'error' }) }
  finally { creating.value = false }
}

const revealOpen = ref(false)
const revealTarget = ref<any>(null)
function openReveal(s: any) { revealTarget.value = s; revealOpen.value = true }
async function revealSecret(reason: string, headers: Record<string, string>) {
  const s = revealTarget.value
  const res: any = await $fetch(`/api/pam/v1/secrets/${s.id}/reveal`, { method: 'POST', body: { reason }, headers })
  return { value: res.value, version: res.version, displaySeconds: 30 }
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
              <td class="px-3 py-2"><span class="font-mono text-foam">{{ s.path }}</span><span class="block text-xs text-faint">{{ s.name }}</span></td>
              <td class="px-3 py-2 text-(--color-muted)">{{ s.secret_type }}</td>
              <td class="px-3 py-2 text-(--color-muted)">{{ s.environment || '—' }}</td>
              <td class="px-3 py-2 text-xs text-faint">v{{ s.current_version }}</td>
              <td class="px-3 py-2 text-xs text-faint">{{ s.policy_count }}</td>
              <td class="px-3 py-2 text-right"><UButton v-if="canUseSecrets" size="xs" color="warning" variant="ghost" icon="i-lucide-eye" @click="openReveal(s)">Reveal</UButton></td>
            </tr>
          </tbody>
        </table>
      </div>
    </DataState>

    <PamRevealModal v-model:open="revealOpen" title="Reveal secret" :subject="revealTarget?.path" :reveal="revealSecret" />

    <UModal v-model:open="showCreate" title="New secret">
      <template #body>
        <div class="space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Name" required><UInput v-model="form.name" class="w-full" /></UFormField>
            <UFormField label="Path" required><UInput v-model="form.path" class="w-full" placeholder="app/prod/db" /></UFormField>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Type"><USelect v-model="form.secret_type" class="w-full" :items="['kv','json','db_credential','api_token','certificate','ssh_key','cloud_credential','password']" /></UFormField>
            <UFormField label="Safe"><USelect v-model="form.safe_id" class="w-full" :items="[{label:'(none)',value:''},...(safes||[]).map(s=>({label:s.name,value:s.id}))]" /></UFormField>
          </div>
          <UFormField label="Value" hint="sealed immediately"><UInput v-model="form.value" type="password" class="w-full" :disabled="form.generate" /></UFormField>
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
