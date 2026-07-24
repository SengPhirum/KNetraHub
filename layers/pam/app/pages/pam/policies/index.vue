<script setup lang="ts">
// Access (approval) policies. Safes with no explicit policy use the built-in
// default (single manager approval, recording required, no self-approval).
// Admins can create policies here (name, approval type, controls, one approver
// level); multi-level chains are managed via the API.
const toast = useToast()
const { canSettings, can } = usePam()
const canManage = computed(() => can('pam.policy.manage'))
const { data, status, error, refresh } = useAsyncData('pamPolicies',
  () => $fetch<any[]>('/api/pam/v1/access-policies'), { server: false, default: () => [] })

const APPROVAL_TYPES = ['none', 'one', 'manager', 'security', 'safe_owner', 'asset_owner', 'any_of_group', 'all_selected', 'sequential', 'parallel', 'multi_level', 'risk_based', 'ticket_only', 'approval_and_ticket']
const APPROVER_TYPES = ['manager', 'security', 'group', 'asset_owner', 'safe_owner']
const noApprover = (t: string) => t === 'none' || t === 'ticket_only'

const showCreate = ref(false)
const creating = ref(false)
const form = reactive({
  name: '', description: '', approval_type: 'manager',
  require_ticket: false, require_mfa: false, require_recording: true, allow_self_approval: false,
  max_duration_minutes: 240, max_concurrent_sessions: 1,
  approverType: 'manager', quorum: 1
})
async function create() {
  creating.value = true
  try {
    const body: any = {
      name: form.name, description: form.description || null, approval_type: form.approval_type,
      require_ticket: form.require_ticket, require_mfa: form.require_mfa, require_recording: form.require_recording,
      allow_self_approval: form.allow_self_approval, max_duration_minutes: form.max_duration_minutes,
      max_concurrent_sessions: form.max_concurrent_sessions
    }
    if (!noApprover(form.approval_type)) body.levels = [{ level: 1, approverType: form.approverType, quorum: form.quorum }]
    await $fetch('/api/pam/v1/access-policies', { method: 'POST', body })
    toast.add({ title: 'Policy created', color: 'success' })
    showCreate.value = false
    await refresh()
  } catch (e: any) { toast.add({ title: 'Could not create policy', description: e?.data?.statusMessage, color: 'error' }) }
  finally { creating.value = false }
}
</script>

<template>
  <div>
    <PageHeader title="Access policies" subtitle="Approval workflows and access controls" icon="i-lucide-scale">
      <template v-if="canManage" #actions><UButton icon="i-lucide-plus" size="sm" @click="showCreate = true">New policy</UButton></template>
    </PageHeader>
    <UAlert color="info" variant="soft" class="mb-4" icon="i-lucide-info"
      title="Default policy"
      description="Safes without an assigned policy require a single manager approval, mandatory recording, no self-approval, and a 4-hour maximum session. Assign a policy to a safe to change this." />
    <DataState :status="status" :error="error" :empty="!data?.length" empty-label="No custom policies. The built-in default applies.">
      <div class="space-y-3">
        <div v-for="p in data" :key="p.id" class="panel p-4">
          <div class="mb-1 flex items-center justify-between">
            <p class="font-display font-semibold text-foam">{{ p.name }}</p>
            <span class="rounded bg-surface-2 px-1.5 py-0.5 text-xs text-(--color-muted)">{{ p.approval_type }}</span>
          </div>
          <p v-if="p.description" class="mb-2 text-sm text-(--color-muted)">{{ p.description }}</p>
          <div class="flex flex-wrap gap-3 text-xs text-faint">
            <span>Ticket: {{ p.require_ticket ? 'required' : 'no' }}</span>
            <span>MFA: {{ p.require_mfa ? 'required' : 'no' }}</span>
            <span>Recording: {{ p.require_recording ? 'required' : 'no' }}</span>
            <span>Max {{ p.max_duration_minutes }}m · {{ p.max_concurrent_sessions }} concurrent</span>
            <span>{{ p.rules.length }} approval level(s)</span>
          </div>
        </div>
      </div>
    </DataState>

    <UModal v-model:open="showCreate" title="New access policy">
      <template #body>
        <div class="space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Name" required><UInput v-model="form.name" class="w-full" /></UFormField>
            <UFormField label="Approval type"><USelect v-model="form.approval_type" class="w-full" :items="APPROVAL_TYPES" /></UFormField>
          </div>
          <UFormField label="Description"><UInput v-model="form.description" class="w-full" /></UFormField>
          <div v-if="!noApprover(form.approval_type)" class="grid grid-cols-2 gap-3">
            <UFormField label="Approver"><USelect v-model="form.approverType" class="w-full" :items="APPROVER_TYPES" /></UFormField>
            <UFormField label="Quorum" hint="distinct approvers needed"><UInput v-model.number="form.quorum" type="number" class="w-full" /></UFormField>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Max duration (min)"><UInput v-model.number="form.max_duration_minutes" type="number" class="w-full" /></UFormField>
            <UFormField label="Max concurrent sessions"><UInput v-model.number="form.max_concurrent_sessions" type="number" class="w-full" /></UFormField>
          </div>
          <div class="flex flex-wrap gap-4 pt-1">
            <UCheckbox v-model="form.require_ticket" label="Require ticket" />
            <UCheckbox v-model="form.require_mfa" label="Require MFA" />
            <UCheckbox v-model="form.require_recording" label="Require recording" />
            <UCheckbox v-model="form.allow_self_approval" label="Allow self-approval" />
          </div>
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
