<script setup lang="ts">
// Applications — workload identities that retrieve authorized secrets. Create
// an application, then issue an api_token identity (shown once).
const toast = useToast()
const { canManageSecrets, shortTime } = usePam()
const { data, status, error, refresh } = useAsyncData('pamApplications',
  () => $fetch<any[]>('/api/pam/v1/applications'), { server: false, default: () => [] })

const showCreate = ref(false)
const creating = ref(false)
const form = reactive({ name: '', description: '', environment: '' })
async function create() {
  creating.value = true
  try {
    await $fetch('/api/pam/v1/applications', { method: 'POST', body: { ...form } })
    toast.add({ title: 'Application registered', color: 'success' })
    showCreate.value = false; Object.assign(form, { name: '', description: '', environment: '' })
    await refresh()
  } catch (e: any) { toast.add({ title: 'Could not create', description: e?.data?.statusMessage, color: 'error' }) }
  finally { creating.value = false }
}

const newToken = ref('')
const tokenOpen = ref(false)
watch(tokenOpen, (o) => { if (!o) newToken.value = '' })
async function issueToken(app: any) {
  try {
    const res: any = await $fetch(`/api/pam/v1/applications/${app.id}/identities`, { method: 'POST', body: { method: 'api_token', name: 'default' } })
    newToken.value = res.token
    tokenOpen.value = true
    await refresh()
  } catch (e: any) { toast.add({ title: 'Could not issue token', description: e?.data?.statusMessage, color: 'error' }) }
}
</script>

<template>
  <div>
    <PageHeader title="Applications" subtitle="Workload identities for the secrets API" icon="i-lucide-boxes">
      <template v-if="canManageSecrets" #actions><UButton icon="i-lucide-plus" size="sm" @click="showCreate = true">Register application</UButton></template>
    </PageHeader>
    <PamOneTimeSecretModal v-model:open="tokenOpen" title="Application token" label="application token" :value="newToken" />
    <DataState :status="status" :error="error" :empty="!data?.length" empty-label="No applications.">
      <div class="panel overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="text-xs uppercase text-faint"><tr><th class="px-3 py-2">Application</th><th class="px-3 py-2">Env</th><th class="px-3 py-2">Identities</th><th class="px-3 py-2">Policies</th><th class="px-3 py-2"></th></tr></thead>
          <tbody class="divide-y divide-surface">
            <tr v-for="a in data" :key="a.id" class="hover:bg-surface-2/40">
              <td class="px-3 py-2 font-medium text-foam">{{ a.name }} <span class="font-mono text-xs text-faint">{{ a.slug }}</span></td>
              <td class="px-3 py-2 text-(--color-muted)">{{ a.environment || '—' }}</td>
              <td class="px-3 py-2 text-xs text-faint">{{ a.identity_count }}</td>
              <td class="px-3 py-2 text-xs text-faint">{{ a.policy_count }}</td>
              <td class="px-3 py-2 text-right"><UButton v-if="canManageSecrets" size="xs" variant="soft" icon="i-lucide-key" @click="issueToken(a)">Issue token</UButton></td>
            </tr>
          </tbody>
        </table>
      </div>
    </DataState>

    <UModal v-model:open="showCreate" title="Register application">
      <template #body>
        <div class="space-y-3">
          <UFormField label="Name" required><UInput v-model="form.name" /></UFormField>
          <UFormField label="Environment"><UInput v-model="form.environment" /></UFormField>
          <UFormField label="Description"><UTextarea v-model="form.description" :rows="2" /></UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="showCreate = false">Cancel</UButton>
          <UButton :loading="creating" :disabled="!form.name" @click="create">Register</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
