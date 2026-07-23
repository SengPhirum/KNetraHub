<script setup lang="ts">
// Active grants — time-bound authorizations; monitors may revoke.
const toast = useToast()
const { canTerminate, shortTime } = usePam()
const { data, status, error, refresh } = useAsyncData('pamGrants',
  () => $fetch<any[]>('/api/pam/v1/grants'), { server: false, default: () => [] })

async function revoke(g: any) {
  try {
    await $fetch(`/api/pam/v1/grants/${g.id}/revoke`, { method: 'POST', body: { reason: 'revoked from console' } })
    toast.add({ title: 'Grant revoked', color: 'success' })
    await refresh()
  } catch (e: any) { toast.add({ title: 'Could not revoke', description: e?.data?.statusMessage, color: 'error' }) }
}
</script>

<template>
  <div>
    <PageHeader title="Active grants" subtitle="Issued, time-bound privileged access" icon="i-lucide-badge-check" />
    <DataState :status="status" :error="error" :empty="!data?.length" empty-label="No active grants.">
      <div class="panel overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="text-xs uppercase text-faint"><tr><th class="px-3 py-2">Grantee</th><th class="px-3 py-2">Account</th><th class="px-3 py-2">Action</th><th class="px-3 py-2">Expires</th><th class="px-3 py-2">Uses</th><th class="px-3 py-2"></th></tr></thead>
          <tbody class="divide-y divide-surface">
            <tr v-for="g in data" :key="g.id" class="hover:bg-surface-2/40">
              <td class="px-3 py-2 text-foam">{{ g.grantee }}<UIcon v-if="g.emergency" name="i-lucide-siren" class="ml-1 size-3.5 text-rose-400" /></td>
              <td class="px-3 py-2 text-(--color-muted)">{{ g.account_name }} <span class="font-mono text-xs text-faint">{{ g.account_username }}</span></td>
              <td class="px-3 py-2 text-(--color-muted)">{{ g.action }}</td>
              <td class="px-3 py-2 text-xs text-faint">{{ shortTime(g.expires_at) }}</td>
              <td class="px-3 py-2 text-xs text-faint">{{ g.use_count }}{{ g.max_use_count ? '/' + g.max_use_count : '' }}</td>
              <td class="px-3 py-2 text-right"><UButton v-if="canTerminate" size="xs" color="error" variant="ghost" icon="i-lucide-ban" @click="revoke(g)">Revoke</UButton></td>
            </tr>
          </tbody>
        </table>
      </div>
    </DataState>
  </div>
</template>
