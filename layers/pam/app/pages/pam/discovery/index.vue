<script setup lang="ts">
// Discovery — pending discovered accounts and source/run summary. Onboard a
// discovered account into a safe.
const toast = useToast()
const { shortTime } = usePam()
const { data, status, error, refresh } = useAsyncData('pamDiscovery',
  () => $fetch<any>('/api/pam/v1/discovery/pending'), { server: false, default: () => ({ pending: [], sources: [], runs: [] }) })
const { data: safes } = useAsyncData('pamDiscSafes', () => $fetch<any[]>('/api/pam/v1/safes'), { server: false, default: () => [] })

const onboarding = ref<any>(null)
const targetSafe = ref('')
async function onboard() {
  if (!onboarding.value || !targetSafe.value) return
  try {
    await $fetch(`/api/pam/v1/discovery/pending/${onboarding.value.id}/onboard`, { method: 'POST', body: { safe_id: targetSafe.value } })
    toast.add({ title: 'Account onboarded', color: 'success' })
    onboarding.value = null; targetSafe.value = ''
    await refresh()
  } catch (e: any) { toast.add({ title: 'Could not onboard', description: e?.data?.statusMessage, color: 'error' }) }
}
</script>

<template>
  <div>
    <PageHeader title="Discovery" subtitle="Unmanaged privileged accounts awaiting onboarding" icon="i-lucide-inbox" />
    <div class="mb-4 grid gap-3 sm:grid-cols-3">
      <StatCard label="Pending" :value="data.pending.length" icon="i-lucide-inbox" accent />
      <StatCard label="Sources" :value="data.sources.length" icon="i-lucide-radar" />
      <StatCard label="Recent runs" :value="data.runs.length" icon="i-lucide-scan-line" />
    </div>
    <DataState :status="status" :error="error" :empty="!data.pending.length" empty-label="No pending discovered accounts.">
      <div class="panel overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="text-xs uppercase text-faint"><tr><th class="px-3 py-2">Username</th><th class="px-3 py-2">Address</th><th class="px-3 py-2">Type</th><th class="px-3 py-2">Group</th><th class="px-3 py-2">Seen</th><th class="px-3 py-2"></th></tr></thead>
          <tbody class="divide-y divide-surface">
            <tr v-for="a in data.pending" :key="a.id" class="hover:bg-surface-2/40">
              <td class="px-3 py-2 font-mono text-foam">{{ a.username }}</td>
              <td class="px-3 py-2 font-mono text-xs text-faint">{{ a.address || '—' }}</td>
              <td class="px-3 py-2 text-(--color-muted)">{{ a.account_type || '—' }}</td>
              <td class="px-3 py-2 text-(--color-muted)">{{ a.privileged_group || '—' }}</td>
              <td class="px-3 py-2 text-xs text-faint">{{ shortTime(a.last_seen) }}</td>
              <td class="px-3 py-2 text-right"><UButton size="xs" icon="i-lucide-import" @click="onboarding = a">Onboard</UButton></td>
            </tr>
          </tbody>
        </table>
      </div>
    </DataState>

    <UModal :open="!!onboarding" title="Onboard discovered account" @update:open="v => !v && (onboarding = null)">
      <template #body>
        <div class="space-y-3">
          <p class="text-sm text-(--color-muted)">Onboard <span class="font-mono text-foam">{{ onboarding?.username }}</span> into a safe.</p>
          <UFormField label="Safe" required><USelect v-model="targetSafe" :items="(safes||[]).map(s=>({label:s.name,value:s.id}))" /></UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="onboarding = null">Cancel</UButton>
          <UButton :disabled="!targetSafe" @click="onboard">Onboard</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
