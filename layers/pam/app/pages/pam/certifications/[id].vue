<script setup lang="ts">
// Certification campaign detail — review each item: certify / revoke / delegate.
// A revoke performs the real enforcement server-side (revoke grant, disable
// account, remove membership) and is audited.
const route = useRoute()
const toast = useToast()
const { canManageCertifications, statusBadge, shortTime } = usePam()
const id = computed(() => String(route.params.id))
const { data, status, error, refresh } = useAsyncData(`pamCert-${id.value}`,
  () => $fetch<any>(`/api/pam/v1/certifications/${id.value}`), { server: false, default: () => null })

const busy = ref<string | null>(null)
async function decide(item: any, decision: 'certified' | 'revoked' | 'delegated') {
  busy.value = item.id
  try {
    const res: any = await $fetch(`/api/pam/v1/certifications/${id.value}/items/${item.id}/decide`, { method: 'POST', body: { decision } })
    toast.add({ title: `Marked ${decision}${res.enforcement ? ` — ${res.enforcement}` : ''}`, color: decision === 'revoked' ? 'warning' : 'success' })
    await refresh()
  } catch (e: any) { toast.add({ title: 'Could not record decision', description: e?.data?.statusMessage, color: 'error' }) }
  finally { busy.value = null }
}
</script>

<template>
  <div>
    <UButton to="/pam/certifications" icon="i-lucide-arrow-left" variant="ghost" size="xs" class="mb-2">All campaigns</UButton>
    <DataState :status="status" :error="error">
      <div v-if="data" class="space-y-5">
        <PageHeader :title="data.name" :subtitle="`Reviewer: ${data.reviewer || '—'}${data.due_date ? ' · due ' + data.due_date.slice(0,10) : ''}`" icon="i-lucide-clipboard-check">
          <template #actions><span class="rounded px-2 py-1 text-xs" :class="statusBadge(data.status)">{{ data.status }}</span></template>
        </PageHeader>

        <div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatCard label="Total" :value="data.counts.total" icon="i-lucide-list" />
          <StatCard label="Pending" :value="data.counts.pending" icon="i-lucide-clock" :accent="data.counts.pending > 0" />
          <StatCard label="Certified" :value="data.counts.certified" icon="i-lucide-check" />
          <StatCard label="Revoked" :value="data.counts.revoked" icon="i-lucide-x" />
          <StatCard label="Delegated" :value="data.counts.delegated" icon="i-lucide-share-2" />
        </div>

        <div class="panel overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="text-xs uppercase text-faint"><tr><th class="px-3 py-2">Subject</th><th class="px-3 py-2">Type</th><th class="px-3 py-2">Decision</th><th class="px-3 py-2">Reviewer</th><th class="px-3 py-2 text-right">Action</th></tr></thead>
            <tbody class="divide-y divide-surface">
              <tr v-for="it in data.items" :key="it.id" class="hover:bg-surface-2/40">
                <td class="px-3 py-2 text-foam">{{ it.subject_label }}</td>
                <td class="px-3 py-2 text-xs text-faint">{{ it.subject_type }}</td>
                <td class="px-3 py-2"><span class="rounded px-1.5 py-0.5 text-xs" :class="statusBadge(it.decision)">{{ it.decision }}</span><span v-if="it.decided_at" class="block text-xs text-faint">{{ shortTime(it.decided_at) }}</span></td>
                <td class="px-3 py-2 text-xs text-(--color-muted)">{{ it.reviewer || '—' }}</td>
                <td class="px-3 py-2">
                  <div v-if="canManageCertifications && it.decision === 'pending'" class="flex justify-end gap-1">
                    <UButton size="xs" color="success" variant="soft" :loading="busy===it.id" icon="i-lucide-check" @click="decide(it,'certified')">Certify</UButton>
                    <UButton size="xs" color="error" variant="soft" :loading="busy===it.id" icon="i-lucide-x" @click="decide(it,'revoked')">Revoke</UButton>
                    <UButton size="xs" color="neutral" variant="ghost" :loading="busy===it.id" icon="i-lucide-share-2" @click="decide(it,'delegated')">Delegate</UButton>
                  </div>
                  <span v-else class="block text-right text-xs text-faint">{{ it.comment || '—' }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </DataState>
  </div>
</template>
