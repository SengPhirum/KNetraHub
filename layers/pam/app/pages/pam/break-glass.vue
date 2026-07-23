<script setup lang="ts">
// Break-glass emergency access — a deliberate, heavily-audited path. Requires a
// reason and (by policy) an incident number, and a step-up security-password
// confirmation (ConfirmPasswordModal) before it fires.
const toast = useToast()
const { data: accountsData } = useAsyncData('pamBgAccounts', () => $fetch<any>('/api/pam/v1/accounts', { params: { limit: 200 } }), { server: false, default: () => ({ items: [] }) })

const form = reactive({ account_id: '', reason: '', incident_number: '' })
const confirmOpen = ref(false)

function start() {
  if (!form.account_id || !form.reason.trim()) return
  confirmOpen.value = true
}
async function invoke(password: string) {
  const res: any = await $fetch('/api/pam/v1/break-glass', {
    method: 'POST', body: { ...form }, headers: { 'x-confirm-password': password }
  })
  toast.add({ title: 'Break-glass access granted', description: `Expires in ${res.maxMinutes} min. Security has been alerted.`, color: 'warning' })
  await navigateTo(`/pam/accounts/${form.account_id}`)
}
</script>

<template>
  <div class="mx-auto max-w-xl">
    <PageHeader title="Break-glass access" subtitle="Emergency privileged access — controlled and reviewed" icon="i-lucide-siren" />
    <UAlert color="error" variant="soft" icon="i-lucide-shield-alert" class="mb-4"
      title="This is not a normal request"
      description="Break-glass immediately alerts security and management, is fully recorded, and triggers automatic credential rotation afterwards. Use only for genuine emergencies." />
    <section class="panel space-y-4 p-6">
      <UFormField label="Account" required>
        <USelect v-model="form.account_id" :items="(accountsData.items||[]).map((a:any)=>({label:`${a.name} (${a.username})`,value:a.id}))" placeholder="Select the target account" />
      </UFormField>
      <UFormField label="Incident number"><UInput v-model="form.incident_number" placeholder="INC0004567" /></UFormField>
      <UFormField label="Reason" required><UTextarea v-model="form.reason" :rows="3" placeholder="Describe the emergency" /></UFormField>
      <div class="flex justify-end">
        <UButton :disabled="!form.account_id || !form.reason.trim()" color="error" icon="i-lucide-siren" @click="start">Invoke break-glass</UButton>
      </div>
    </section>

    <ConfirmPasswordModal
      v-model:open="confirmOpen"
      title="Confirm break-glass access"
      message="Emergency access will be granted immediately and security will be alerted."
      confirm-label="Invoke break-glass"
      :action="invoke"
    />
  </div>
</template>
