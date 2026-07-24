<script setup lang="ts">
// Account detail — metadata, capabilities, credential lifecycle actions, the
// guarded reveal flow (reason + display timer + watermark + no-copy), connect
// (brokered session), request access, and version history.
const route = useRoute()
const toast = useToast()
const { severityMeta, shortTime } = usePam()
const id = computed(() => String(route.params.id))

const { data, status, error, refresh } = useAsyncData(`pamAccount-${id.value}`,
  () => $fetch<any>(`/api/pam/v1/accounts/${id.value}`), { server: false, default: () => null })

const critBadge = CRITICALITY_BADGE

// ── Reveal flow — shared hardened modal; step-up (428) handled inside it ──
const revealOpen = ref(false)
async function revealAccount(reason: string, headers: Record<string, string>) {
  return await $fetch<any>(`/api/pam/v1/accounts/${id.value}/reveal`, { method: 'POST', body: { reason }, headers })
}
watch(revealOpen, (o) => { if (!o && data.value) refresh() })

async function action(kind: 'rotate' | 'verify' | 'reconcile') {
  try {
    await $fetch(`/api/pam/v1/accounts/${id.value}/${kind}`, { method: 'POST' })
    toast.add({ title: `${kind} queued`, color: 'success' })
    setTimeout(refresh, 1500)
  } catch (e: any) { toast.add({ title: `Could not ${kind}`, description: e?.data?.statusMessage, color: 'error' }) }
}

async function connect() {
  try {
    const res: any = await $fetch('/api/pam/v1/sessions', { method: 'POST', body: { account_id: id.value } })
    toast.add({ title: 'Session brokered', description: 'Credential injected server-side — never shown here.', color: 'success' })
    navigateTo(`/pam/sessions/${res.sessionId}`)
  } catch (e: any) { toast.add({ title: 'Cannot connect', description: e?.data?.statusMessage, color: 'error' }) }
}
async function requestAccess() { navigateTo(`/pam/requests/new?account=${id.value}`) }
</script>

<template>
  <div>
    <UButton to="/pam/accounts" icon="i-lucide-arrow-left" variant="ghost" size="xs" class="mb-2">All accounts</UButton>
    <DataState :status="status" :error="error">
      <div v-if="data" class="space-y-5">
        <PageHeader :title="data.account.name" :subtitle="`${data.account.username}${data.account.address ? ' · ' + data.account.address : ''}`" icon="i-lucide-key-round">
          <template #actions>
            <UButton v-if="data.capabilities.canConnect" icon="i-lucide-monitor-play" size="sm" @click="connect">Connect</UButton>
            <UButton v-if="data.capabilities.canReveal" icon="i-lucide-eye" size="sm" color="warning" variant="soft" @click="revealOpen = true">Reveal</UButton>
            <UButton icon="i-lucide-ticket" size="sm" color="neutral" variant="soft" @click="requestAccess">Request access</UButton>
          </template>
        </PageHeader>

        <div class="flex flex-wrap gap-2">
          <UButton v-if="data.capabilities.canRotate" size="xs" variant="soft" icon="i-lucide-rotate-cw" @click="action('rotate')">Rotate</UButton>
          <UButton v-if="data.capabilities.canVerify" size="xs" variant="soft" icon="i-lucide-badge-check" @click="action('verify')">Verify</UButton>
          <UButton v-if="data.capabilities.canReconcile" size="xs" variant="soft" icon="i-lucide-git-compare" @click="action('reconcile')">Reconcile</UButton>
        </div>

        <div class="grid gap-4 lg:grid-cols-3">
          <section class="panel space-y-2 p-5 lg:col-span-2">
            <h2 class="mb-2 font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted)">Details</h2>
            <div class="grid grid-cols-2 gap-3 text-sm">
              <div><span class="text-faint">Type:</span> {{ data.account.account_type }}</div>
              <div><span class="text-faint">Criticality:</span> <span class="rounded px-1.5 py-0.5 text-xs" :class="critBadge[data.account.criticality]">{{ data.account.criticality }}</span></div>
              <div><span class="text-faint">Rotation:</span> <span class="rounded px-1.5 py-0.5 text-xs" :class="rotationBadge(data.account.rotation_status)">{{ data.account.rotation_status }}</span></div>
              <div><span class="text-faint">Auto-managed:</span> {{ data.account.auto_managed ? 'Yes' : 'No' }}</div>
              <div><span class="text-faint">Last changed:</span> {{ shortTime(data.account.last_changed) }}</div>
              <div><span class="text-faint">Last verified:</span> {{ shortTime(data.account.last_verified) }}</div>
              <div><span class="text-faint">Last used:</span> {{ shortTime(data.account.last_used) }}</div>
              <div><span class="text-faint">Next rotation:</span> {{ shortTime(data.account.next_rotation_at) }}</div>
            </div>
          </section>
          <section class="panel p-5">
            <h2 class="mb-2 font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted)">Credential versions</h2>
            <ul class="space-y-1.5 text-sm">
              <li v-for="v in data.versions" :key="v.version" class="flex items-center justify-between">
                <span class="text-foam">v{{ v.version }} <span class="text-xs text-faint">({{ v.source }})</span></span>
                <span class="text-xs" :class="v.active ? 'text-emerald-400' : 'text-faint'">{{ v.active ? 'active' : shortTime(v.created_at) }}</span>
              </li>
              <li v-if="!data.versions?.length" class="text-faint">No credential stored.</li>
            </ul>
          </section>
        </div>

        <section class="panel p-5">
          <h2 class="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted)">Activity</h2>
          <ul class="space-y-1.5 text-sm">
            <li v-for="e in data.activity" :key="e.id" class="flex items-center gap-2">
              <span class="size-2 rounded-full" :class="severityMeta(e.severity).dot" />
              <span class="font-mono text-xs text-foam">{{ e.action }}</span>
              <span class="text-(--color-muted)">{{ e.actor }}</span>
              <span class="ml-auto text-xs text-faint">{{ shortTime(e.ts) }}</span>
            </li>
            <li v-if="!data.activity?.length" class="text-faint">No activity yet.</li>
          </ul>
        </section>
      </div>
    </DataState>

    <!-- Reveal: shared hardened modal (reason → guarded plaintext, countdown, watermark, step-up) -->
    <PamRevealModal v-model:open="revealOpen" title="Reveal credential" :subject="data?.account?.name" :reveal="revealAccount" />
  </div>
</template>
