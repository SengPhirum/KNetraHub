<script setup lang="ts">
// Onboarding rules (spec §7) — deterministic rules that classify discovered
// accounts (onboard into a safe / ignore) with a priority order. Simulate runs
// the rule set against the current pending queue without changing anything.
const toast = useToast()
const { can } = usePam()
const canManage = computed(() => can('pam.discovery.manage'))
const { data, status, error, refresh } = useAsyncData('pamOnboardingRules',
  () => $fetch<any>('/api/pam/v1/discovery/rules').then(r => r.rules ?? r), { server: false, default: () => [] })
const { data: safes } = useAsyncData('pamRuleSafes', () => $fetch<any[]>('/api/pam/v1/safes'), { server: false, default: () => [] })

const showCreate = ref(false)
const creating = ref(false)
const form = reactive({ name: '', priority: 100, action: 'onboard', assign_safe_id: '', auto_manage: false, conditionsText: '{\n  "account_type": "linux"\n}' })

async function create() {
  let conditions: any
  try { conditions = JSON.parse(form.conditionsText || '{}') } catch { toast.add({ title: 'Conditions must be valid JSON', color: 'error' }); return }
  if (form.action === 'onboard' && !form.assign_safe_id) { toast.add({ title: 'Onboard rules need a target safe', color: 'error' }); return }
  creating.value = true
  try {
    await $fetch('/api/pam/v1/discovery/rules', { method: 'POST', body: {
      name: form.name, priority: form.priority, action: form.action, conditions,
      assign_safe_id: form.assign_safe_id || null, auto_manage: form.auto_manage
    } })
    toast.add({ title: 'Rule created', color: 'success' })
    showCreate.value = false
    await refresh()
  } catch (e: any) { toast.add({ title: 'Could not create', description: e?.data?.statusMessage, color: 'error' }) }
  finally { creating.value = false }
}
async function remove(r: any) {
  try { await $fetch(`/api/pam/v1/discovery/rules/${r.id}`, { method: 'DELETE' }); await refresh() }
  catch (e: any) { toast.add({ title: 'Could not delete', description: e?.data?.statusMessage, color: 'error' }) }
}
const simulating = ref(false)
async function simulate() {
  simulating.value = true
  try {
    const r: any = await $fetch('/api/pam/v1/discovery/rules/simulate', { method: 'POST', body: {} })
    const n = r.matched ?? r.count ?? (Array.isArray(r.results) ? r.results.length : undefined)
    toast.add({ title: 'Simulation complete', description: n != null ? `${n} pending account(s) would match` : 'See results', color: 'success' })
  } catch (e: any) { toast.add({ title: 'Simulation failed', description: e?.data?.statusMessage, color: 'error' }) }
  finally { simulating.value = false }
}
</script>

<template>
  <div>
    <PageHeader title="Onboarding rules" subtitle="Classify discovered accounts automatically" icon="i-lucide-list-checks">
      <template #actions>
        <UButton to="/pam/discovery/sources" size="sm" color="neutral" variant="soft" icon="i-lucide-radar">Sources</UButton>
        <UButton size="sm" color="neutral" variant="soft" :loading="simulating" icon="i-lucide-flask-conical" @click="simulate">Simulate</UButton>
        <UButton v-if="canManage" size="sm" icon="i-lucide-plus" @click="showCreate = true">New rule</UButton>
      </template>
    </PageHeader>
    <DataState :status="status" :error="error" :empty="!data?.length" empty-label="No onboarding rules." empty-icon="i-lucide-list-checks">
      <div class="panel overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="text-xs uppercase text-faint"><tr><th class="px-3 py-2">Priority</th><th class="px-3 py-2">Rule</th><th class="px-3 py-2">Action</th><th class="px-3 py-2">Conditions</th><th class="px-3 py-2 text-right"></th></tr></thead>
          <tbody class="divide-y divide-surface">
            <tr v-for="r in data" :key="r.id" class="hover:bg-surface-2/40">
              <td class="px-3 py-2 text-faint">{{ r.priority }}</td>
              <td class="px-3 py-2 text-foam">{{ r.name }}</td>
              <td class="px-3 py-2 text-xs text-(--color-muted)">{{ r.action }}<span v-if="r.auto_manage" class="ml-1 text-emerald-400">· auto-manage</span></td>
              <td class="px-3 py-2 font-mono text-xs text-faint">{{ typeof r.conditions === 'string' ? r.conditions : JSON.stringify(r.conditions) }}</td>
              <td class="px-3 py-2 text-right"><UButton v-if="canManage" size="xs" color="error" variant="ghost" icon="i-lucide-trash-2" @click="remove(r)" /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </DataState>

    <UModal v-model:open="showCreate" title="New onboarding rule">
      <template #body>
        <div class="space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Name" required><UInput v-model="form.name" class="w-full" /></UFormField>
            <UFormField label="Priority" hint="lower = evaluated first"><UInput v-model.number="form.priority" type="number" class="w-full" /></UFormField>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Action"><USelect v-model="form.action" class="w-full" :items="['onboard','ignore']" /></UFormField>
            <UFormField v-if="form.action==='onboard'" label="Target safe" required><USelectMenu v-model="form.assign_safe_id" class="w-full" value-key="value" :items="(safes||[]).map(s=>({label:s.name,value:s.id}))" /></UFormField>
          </div>
          <UFormField label="Conditions (JSON)" hint="matched against each discovered account"><UTextarea v-model="form.conditionsText" :rows="4" class="w-full font-mono text-xs" /></UFormField>
          <UCheckbox v-if="form.action==='onboard'" v-model="form.auto_manage" label="Auto-manage (enable rotation on onboard)" />
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
