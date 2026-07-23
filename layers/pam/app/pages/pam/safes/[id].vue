<script setup lang="ts">
// Safe detail — metadata, the caller's granular permissions, member management,
// and the safe activity timeline.
const route = useRoute()
const toast = useToast()
const { severityMeta, shortTime } = usePam()
const id = computed(() => String(route.params.id))

const { data, status, error, refresh } = useAsyncData(`pamSafe-${id.value}`,
  () => $fetch<any>(`/api/pam/v1/safes/${id.value}`), { server: false, default: () => null })
const { data: members, refresh: refreshMembers } = useAsyncData(`pamSafeMembers-${id.value}`,
  () => $fetch<any[]>(`/api/pam/v1/safes/${id.value}/members`), { server: false, default: () => [] })

const canManageMembers = computed(() => data.value?.myPermissions?.includes('manage_members'))
const showAdd = ref(false)
const adding = ref(false)
const memberForm = reactive({ principal_type: 'user', principal_id: '', principal_name: '', preset: 'user' })

async function addMember() {
  adding.value = true
  try {
    await $fetch(`/api/pam/v1/safes/${id.value}/members`, { method: 'POST', body: { ...memberForm } })
    toast.add({ title: 'Member added', color: 'success' })
    showAdd.value = false
    Object.assign(memberForm, { principal_type: 'user', principal_id: '', principal_name: '', preset: 'user' })
    await refreshMembers()
  } catch (e: any) {
    toast.add({ title: 'Could not add member', description: e?.data?.statusMessage, color: 'error' })
  } finally { adding.value = false }
}
async function removeMember(memberId: string) {
  try {
    await $fetch(`/api/pam/v1/safes/${id.value}/members/${memberId}`, { method: 'DELETE' })
    await refreshMembers()
  } catch (e: any) { toast.add({ title: 'Could not remove member', description: e?.data?.statusMessage, color: 'error' }) }
}
</script>

<template>
  <div>
    <UButton to="/pam/safes" icon="i-lucide-arrow-left" variant="ghost" size="xs" class="mb-2">All safes</UButton>
    <DataState :status="status" :error="error">
      <div v-if="data" class="space-y-5">
        <PageHeader :title="data.safe.name" :subtitle="`${data.safe.slug} · ${data.safe.environment} · ${data.safe.criticality}`" icon="i-lucide-vault" />

        <div class="grid gap-4 lg:grid-cols-3">
          <section class="panel space-y-2 p-5 lg:col-span-2">
            <h2 class="mb-2 font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted)">Details</h2>
            <p v-if="data.safe.description" class="text-sm text-(--color-muted)">{{ data.safe.description }}</p>
            <div class="grid grid-cols-2 gap-3 text-sm">
              <div><span class="text-faint">Business owner:</span> {{ data.safe.business_owner || '—' }}</div>
              <div><span class="text-faint">Technical owner:</span> {{ data.safe.technical_owner || '—' }}</div>
              <div><span class="text-faint">Department:</span> {{ data.safe.department || '—' }}</div>
              <div><span class="text-faint">Retention:</span> {{ data.safe.retention_days }} days</div>
              <div><span class="text-faint">Accounts:</span> {{ data.accountCount }}</div>
              <div><span class="text-faint">Dual control:</span> {{ data.safe.require_dual_control ? 'Yes' : 'No' }}</div>
            </div>
          </section>
          <section class="panel p-5">
            <h2 class="mb-2 font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted)">Your permissions</h2>
            <div class="flex flex-wrap gap-1.5">
              <span v-for="p in data.myPermissions" :key="p" class="rounded bg-surface-2 px-1.5 py-0.5 text-xs text-(--color-muted)">{{ p }}</span>
              <span v-if="!data.myPermissions?.length" class="text-sm text-faint">No granular permissions.</span>
            </div>
          </section>
        </div>

        <section class="panel p-5">
          <div class="mb-3 flex items-center justify-between">
            <h2 class="font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted)">Members</h2>
            <UButton v-if="canManageMembers" icon="i-lucide-user-plus" size="xs" @click="showAdd = true">Add member</UButton>
          </div>
          <table class="w-full text-left text-sm">
            <thead class="text-xs uppercase text-faint"><tr><th class="py-1.5">Principal</th><th>Type</th><th>Permissions</th><th></th></tr></thead>
            <tbody class="divide-y divide-surface">
              <tr v-for="m in members" :key="m.id" class="hover:bg-surface-2/40">
                <td class="py-2 text-foam">{{ m.principal_name }} <span class="font-mono text-xs text-faint">{{ m.principal_id }}</span></td>
                <td class="py-2 text-(--color-muted)">{{ m.principal_type }}</td>
                <td class="py-2 text-xs text-faint">{{ (m.permissions || []).length }} perms</td>
                <td class="py-2 text-right"><UButton v-if="canManageMembers" icon="i-lucide-trash-2" size="xs" color="error" variant="ghost" @click="removeMember(m.id)" /></td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="panel p-5">
          <h2 class="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted)">Activity</h2>
          <div v-if="!data.timeline?.length" class="py-4 text-center text-sm text-faint">No activity yet.</div>
          <ul v-else class="space-y-1.5 text-sm">
            <li v-for="e in data.timeline" :key="e.id" class="flex items-center gap-2">
              <span class="size-2 rounded-full" :class="severityMeta(e.severity).dot" />
              <span class="font-mono text-xs text-foam">{{ e.action }}</span>
              <span class="text-(--color-muted)">{{ e.actor }}</span>
              <span class="ml-auto text-xs text-faint">{{ shortTime(e.ts) }}</span>
            </li>
          </ul>
        </section>
      </div>
    </DataState>

    <UModal v-model:open="showAdd" title="Add safe member">
      <template #body>
        <div class="space-y-3">
          <UFormField label="Type"><USelect v-model="memberForm.principal_type" :items="['user','group']" /></UFormField>
          <UFormField label="Principal (username or group)" required><UInput v-model="memberForm.principal_id" /></UFormField>
          <UFormField label="Display name"><UInput v-model="memberForm.principal_name" /></UFormField>
          <UFormField label="Permission preset">
            <USelect v-model="memberForm.preset" :items="['reader','user','approver','owner']" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="showAdd = false">Cancel</UButton>
          <UButton :loading="adding" :disabled="!memberForm.principal_id" @click="addMember">Add</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
