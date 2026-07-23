<script setup lang="ts">
// Request detail — accounts, approval chain, tickets, issued grants, and
// approve/reject/cancel actions.
const route = useRoute()
const toast = useToast()
const { canApprove, shortTime } = usePam()
const { user } = useAuth()
const id = computed(() => String(route.params.id))

const { data, status, error, refresh } = useAsyncData(`pamRequest-${id.value}`,
  () => $fetch<any>(`/api/pam/v1/requests/${id.value}`), { server: false, default: () => null })

const comment = ref('')
const busy = ref(false)
const isRequester = computed(() => data.value?.request?.requester?.toLowerCase() === user.value?.username?.toLowerCase())

async function act(kind: 'approve' | 'reject' | 'cancel') {
  busy.value = true
  try {
    const body = kind === 'approve' ? { comment: comment.value } : { reason: comment.value }
    await $fetch(`/api/pam/v1/requests/${id.value}/${kind}`, { method: 'POST', body })
    toast.add({ title: `Request ${kind}${kind === 'cancel' ? 'led' : kind === 'approve' ? 'd' : 'ed'}`, color: 'success' })
    await refresh()
  } catch (e: any) { toast.add({ title: `Could not ${kind}`, description: e?.data?.statusMessage, color: 'error' }) }
  finally { busy.value = false }
}
const decisionBadge: Record<string, string> = {
  pending: 'text-amber-400', approved: 'text-emerald-400', rejected: 'text-rose-400', delegated: 'text-sky-400', expired: 'text-faint'
}
</script>

<template>
  <div>
    <UButton to="/pam/requests" icon="i-lucide-arrow-left" variant="ghost" size="xs" class="mb-2">Requests</UButton>
    <DataState :status="status" :error="error">
      <div v-if="data" class="space-y-5">
        <PageHeader :title="`Request ${id.slice(0,8)}`" :subtitle="`${data.request.action} · ${data.request.requester}`" icon="i-lucide-ticket" />
        <div class="grid gap-4 lg:grid-cols-3">
          <section class="panel space-y-2 p-5 lg:col-span-2">
            <div class="flex items-center gap-2">
              <span class="text-sm text-faint">Status:</span>
              <span class="font-semibold text-foam">{{ data.request.status }}</span>
              <UIcon v-if="data.request.emergency" name="i-lucide-siren" class="size-4 text-rose-400" />
            </div>
            <p class="text-sm"><span class="text-faint">Reason:</span> {{ data.request.reason }}</p>
            <p v-if="data.request.ticket_number" class="text-sm"><span class="text-faint">Ticket:</span> {{ data.request.ticket_system }} {{ data.request.ticket_number }}</p>
            <p v-if="data.request.decision_reason" class="text-sm text-rose-400">{{ data.request.decision_reason }}</p>
            <div class="pt-2">
              <p class="mb-1 text-xs uppercase text-faint">Accounts</p>
              <ul class="space-y-1 text-sm">
                <li v-for="a in data.accounts" :key="a.id" class="text-foam">{{ a.name }} <span class="font-mono text-xs text-faint">{{ a.username }}@{{ a.address || a.safe_name }}</span></li>
              </ul>
            </div>
          </section>
          <section class="panel p-5">
            <h2 class="mb-2 font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted)">Approvals</h2>
            <ul class="space-y-1.5 text-sm">
              <li v-for="ap in data.approvals" :key="ap.id" class="flex items-center justify-between">
                <span class="text-(--color-muted)">L{{ ap.level }} {{ ap.approver || ap.approver_ref || '—' }}</span>
                <span :class="decisionBadge[ap.decision]">{{ ap.decision }}</span>
              </li>
              <li v-if="!data.approvals?.length" class="text-faint">No approval required.</li>
            </ul>
            <div v-if="data.grants?.length" class="mt-3 border-t border-surface pt-3">
              <p class="mb-1 text-xs uppercase text-faint">Grants</p>
              <ul class="space-y-1 text-sm">
                <li v-for="g in data.grants" :key="g.id" class="flex items-center justify-between">
                  <span class="text-emerald-400">{{ g.status }}</span>
                  <span class="text-xs text-faint">until {{ shortTime(g.expires_at) }}</span>
                </li>
              </ul>
            </div>
          </section>
        </div>

        <section v-if="data.request.status === 'pending'" class="panel space-y-3 p-5">
          <UFormField :label="canApprove ? 'Comment / rejection reason' : 'Cancel this request'">
            <UTextarea v-if="canApprove || isRequester" v-model="comment" :rows="2" />
          </UFormField>
          <div class="flex flex-wrap gap-2">
            <template v-if="canApprove">
              <UButton :loading="busy" color="success" icon="i-lucide-check" @click="act('approve')">Approve</UButton>
              <UButton :loading="busy" color="error" variant="soft" icon="i-lucide-x" :disabled="!comment.trim()" @click="act('reject')">Reject</UButton>
            </template>
            <UButton v-if="isRequester" :loading="busy" color="neutral" variant="soft" icon="i-lucide-ban" @click="act('cancel')">Cancel request</UButton>
          </div>
        </section>
      </div>
    </DataState>
  </div>
</template>
