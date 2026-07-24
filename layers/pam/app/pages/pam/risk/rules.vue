<script setup lang="ts">
// Risk-rule configuration (spec §12) — enable/disable rules, set severity, and
// choose auto-responses that the evaluation engine EXECUTES (block session,
// disable account, suspend vendor, open investigation, alert). "Evaluate now"
// runs the engine on demand.
const toast = useToast()
const { canManageRisk, severityMeta } = usePam()
const { data, status, error, refresh } = useAsyncData('pamRiskRules',
  () => $fetch<any[]>('/api/pam/v1/risk/rules'), { server: false, default: () => [] })

const ACTIONS = [
  { key: 'alert', label: 'Alert' },
  { key: 'block_session', label: 'Block session' },
  { key: 'disable_account', label: 'Disable account' },
  { key: 'suspend_vendor', label: 'Suspend vendor' },
  { key: 'open_investigation', label: 'Open investigation' }
]
const SEVERITIES = ['low', 'medium', 'high', 'critical']

const evaluating = ref(false)
async function evaluateNow() {
  evaluating.value = true
  try {
    const res: any = await $fetch('/api/pam/v1/risk/evaluate', { method: 'POST', body: {} })
    toast.add({ title: `Evaluated — ${res.created} new finding(s), ${res.actions} auto-response(s)`, color: 'success' })
  } catch (e: any) { toast.add({ title: 'Evaluation failed', description: e?.data?.statusMessage, color: 'error' }) }
  finally { evaluating.value = false }
}

async function toggle(rule: any, enabled: boolean) {
  try {
    await $fetch(`/api/pam/v1/risk/rules/${rule.ruleKey}`, { method: 'PUT', body: { enabled } })
    rule.enabled = enabled
  } catch (e: any) { toast.add({ title: 'Could not update', description: e?.data?.statusMessage, color: 'error' }); await refresh() }
}

// Edit modal
const showEdit = ref(false)
const saving = ref(false)
const edit = reactive<{ ruleKey: string; name: string; severity: string; actions: string[]; threshold: number | null }>({ ruleKey: '', name: '', severity: 'medium', actions: [], threshold: null })
function openEdit(rule: any) {
  edit.ruleKey = rule.ruleKey; edit.name = rule.name; edit.severity = rule.severity
  edit.actions = [...(rule.autoResponse || [])]
  edit.threshold = rule.config?.threshold ?? null
  showEdit.value = true
}
function toggleAction(key: string) {
  const i = edit.actions.indexOf(key)
  if (i >= 0) edit.actions.splice(i, 1); else edit.actions.push(key)
}
async function save() {
  saving.value = true
  try {
    const body: any = { severity: edit.severity, auto_response: edit.actions }
    if (edit.threshold != null && edit.threshold > 0) body.config = { threshold: Number(edit.threshold) }
    await $fetch(`/api/pam/v1/risk/rules/${edit.ruleKey}`, { method: 'PUT', body })
    toast.add({ title: 'Rule updated', color: 'success' })
    showEdit.value = false
    await refresh()
  } catch (e: any) { toast.add({ title: 'Could not save', description: e?.data?.statusMessage, color: 'error' }) }
  finally { saving.value = false }
}
</script>

<template>
  <div>
    <PageHeader title="Risk rules" subtitle="Detection rules &amp; automated responses" icon="i-lucide-shield-alert">
      <template #actions>
        <UButton to="/pam/risk" size="sm" color="neutral" variant="soft" icon="i-lucide-list">Risk events</UButton>
        <UButton v-if="canManageRisk" size="sm" icon="i-lucide-play" :loading="evaluating" @click="evaluateNow">Evaluate now</UButton>
      </template>
    </PageHeader>
    <DataState :status="status" :error="error" :empty="!data?.length" empty-label="No rules.">
      <div class="panel overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="text-xs uppercase text-faint"><tr><th class="px-3 py-2">Rule</th><th class="px-3 py-2">Severity</th><th class="px-3 py-2">Auto-responses</th><th class="px-3 py-2">Enabled</th><th class="px-3 py-2 text-right"></th></tr></thead>
          <tbody class="divide-y divide-surface">
            <tr v-for="r in data" :key="r.ruleKey" class="hover:bg-surface-2/40">
              <td class="px-3 py-2"><span class="text-foam">{{ r.name }}</span><span class="block font-mono text-xs text-faint">{{ r.ruleKey }}</span></td>
              <td class="px-3 py-2"><span class="rounded px-1.5 py-0.5 text-xs" :class="severityMeta(r.severity).badge">{{ severityMeta(r.severity).label }}</span></td>
              <td class="px-3 py-2">
                <span v-if="!r.autoResponse?.length" class="text-xs text-faint">—</span>
                <span v-for="a in r.autoResponse" :key="a" class="mr-1 inline-block rounded bg-surface-2 px-1.5 py-0.5 text-xs text-(--color-muted)">{{ a }}</span>
              </td>
              <td class="px-3 py-2"><USwitch :model-value="r.enabled" :disabled="!canManageRisk" @update:model-value="(v:boolean) => toggle(r, v)" /></td>
              <td class="px-3 py-2 text-right"><UButton v-if="canManageRisk" size="xs" variant="ghost" icon="i-lucide-settings-2" @click="openEdit(r)">Edit</UButton></td>
            </tr>
          </tbody>
        </table>
      </div>
    </DataState>

    <UModal v-model:open="showEdit" :title="`Edit rule — ${edit.name}`">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Severity"><USelect v-model="edit.severity" class="w-full" :items="SEVERITIES" /></UFormField>
          <UFormField label="Auto-responses" hint="executed by the engine when the rule fires">
            <div class="space-y-1.5">
              <label v-for="a in ACTIONS" :key="a.key" class="flex items-center gap-2 text-sm">
                <UCheckbox :model-value="edit.actions.includes(a.key)" @update:model-value="() => toggleAction(a.key)" />
                <span>{{ a.label }}</span>
              </label>
            </div>
          </UFormField>
          <UFormField label="Threshold" hint="for count-based rules (failed access / rejections)"><UInput v-model.number="edit.threshold" type="number" class="w-full" placeholder="default" /></UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="showEdit = false">Cancel</UButton>
          <UButton :loading="saving" @click="save">Save</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
