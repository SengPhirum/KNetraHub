<script setup lang="ts">
// New access request — select accounts, action, window, reason and ticket.
const route = useRoute()
const toast = useToast()
const preAccount = String(route.query.account || '')

const { data: accountsData } = useAsyncData('pamReqAccounts', () => $fetch<any>('/api/pam/v1/accounts', { params: { limit: 200 } }), { server: false, default: () => ({ items: [] }) })

const form = reactive({
  account_ids: preAccount ? [preAccount] : [] as string[],
  action: 'connect', reason: '', ticket_system: '', ticket_number: '',
  max_duration_minutes: 60, source_network: '', emergency: false
})
const submitting = ref(false)

async function submit() {
  submitting.value = true
  try {
    const res: any = await $fetch('/api/pam/v1/requests', { method: 'POST', body: { ...form } })
    toast.add({ title: res.status === 'approved' ? 'Access granted' : 'Request submitted', color: 'success' })
    navigateTo(`/pam/requests/${res.id}`)
  } catch (e: any) {
    toast.add({ title: 'Could not submit request', description: e?.data?.statusMessage, color: 'error' })
  } finally { submitting.value = false }
}
</script>

<template>
  <div class="mx-auto max-w-2xl">
    <UButton to="/pam/requests" icon="i-lucide-arrow-left" variant="ghost" size="xs" class="mb-2">Requests</UButton>
    <PageHeader title="Request privileged access" subtitle="Time-bound access, approved and audited" icon="i-lucide-ticket" />
    <section class="panel space-y-4 p-6">
      <UFormField label="Accounts" required>
        <USelectMenu v-model="form.account_ids" multiple :items="(accountsData.items||[]).map((a:any)=>({label:`${a.name} (${a.username})`,value:a.id}))" placeholder="Select accounts" />
      </UFormField>
      <div class="grid grid-cols-2 gap-3">
        <UFormField label="Action"><USelect v-model="form.action" :items="['connect','use','reveal','rotate','administer']" /></UFormField>
        <UFormField label="Max duration (minutes)"><UInput v-model.number="form.max_duration_minutes" type="number" /></UFormField>
      </div>
      <UFormField label="Business reason" required><UTextarea v-model="form.reason" :rows="3" placeholder="Why do you need this access?" /></UFormField>
      <div class="grid grid-cols-2 gap-3">
        <UFormField label="Ticket system"><UInput v-model="form.ticket_system" placeholder="servicenow / jira" /></UFormField>
        <UFormField label="Ticket number"><UInput v-model="form.ticket_number" placeholder="CHG0012345" /></UFormField>
      </div>
      <UFormField label="Source network (CIDR)" hint="optional restriction"><UInput v-model="form.source_network" placeholder="10.0.0.0/8" /></UFormField>
      <div class="flex justify-end gap-2 pt-2">
        <UButton color="neutral" variant="ghost" to="/pam/requests">Cancel</UButton>
        <UButton :loading="submitting" :disabled="!form.account_ids.length || !form.reason.trim()" @click="submit">Submit request</UButton>
      </div>
    </section>
  </div>
</template>
