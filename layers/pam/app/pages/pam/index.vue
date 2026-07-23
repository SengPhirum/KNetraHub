<script setup lang="ts">
// Executive PAM dashboard — managed/unmanaged accounts, rotation & verification
// health, active sessions, pending approvals, break-glass, risk, and breakdowns
// by platform/safe/protocol. Every widget links to a filtered detail page.
const { hasPam, severityMeta, shortTime } = usePam()

const { data, status, error } = useAsyncData('pamDashboard',
  () => $fetch<any>('/api/pam/v1/dashboard'),
  { server: false, default: () => null }
)

function fmt(n: number | string | undefined): string { return Number(n || 0).toLocaleString() }

const primaryCards = computed(() => {
  const c = data.value?.counts || {}
  return [
    { label: 'Managed accounts', value: fmt(c.managedAccounts), icon: 'i-lucide-key-round', to: '/pam/accounts?status=managed', accent: true },
    { label: 'Unmanaged accounts', value: fmt(c.unmanagedAccounts), icon: 'i-lucide-key', to: '/pam/accounts?status=unmanaged' },
    { label: 'Pending onboarding', value: fmt(c.pendingOnboard), icon: 'i-lucide-inbox', to: '/pam/discovery' },
    { label: 'Due for rotation', value: fmt(c.dueRotation), icon: 'i-lucide-clock', to: '/pam/accounts' }
  ]
})
const healthCards = computed(() => {
  const c = data.value?.counts || {}
  return [
    { label: 'Rotation failures', value: fmt(c.rotationFailures), icon: 'i-lucide-rotate-ccw', to: '/pam/accounts?status=failed', accent: c.rotationFailures > 0 },
    { label: 'Verification failures', value: fmt(c.verifyFailures), icon: 'i-lucide-badge-x', accent: c.verifyFailures > 0 },
    { label: 'Reconcile failures', value: fmt(c.reconcileFailures), icon: 'i-lucide-git-compare', accent: c.reconcileFailures > 0 },
    { label: 'Dead jobs', value: fmt(c.deadJobs), icon: 'i-lucide-skull', accent: c.deadJobs > 0 }
  ]
})
const opsCards = computed(() => {
  const c = data.value?.counts || {}
  return [
    { label: 'Active sessions', value: fmt(c.activeSessions), icon: 'i-lucide-monitor-play', to: '/pam/sessions?active=true', accent: c.activeSessions > 0 },
    { label: 'Pending approvals', value: fmt(c.pendingApprovals), icon: 'i-lucide-gavel', to: '/pam/approvals', accent: c.pendingApprovals > 0 },
    { label: 'Expiring grants', value: fmt(c.expiringGrants), icon: 'i-lucide-badge-check', to: '/pam/grants' },
    { label: 'Open risk events', value: fmt(c.riskOpen), icon: 'i-lucide-shield-alert', to: '/pam/risk', accent: c.riskOpen > 0 }
  ]
})
</script>

<template>
  <div>
    <PageHeader title="Privileged Access" subtitle="Vault, sessions, approvals and privileged threat analytics" icon="i-lucide-shield-keyhole">
      <template v-if="hasPam" #actions>
        <UButton to="/pam/accounts" icon="i-lucide-key-round" size="sm" color="neutral" variant="soft">Accounts</UButton>
        <UButton to="/pam/requests/new" icon="i-lucide-plus" size="sm">Request access</UButton>
      </template>
    </PageHeader>

    <div v-if="!hasPam" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to Privileged Access.</p>
    </div>

    <DataState v-else :status="status" :error="error">
      <div v-if="data" class="space-y-6">
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <NuxtLink v-for="c in primaryCards" :key="c.label" :to="c.to" class="block">
            <StatCard :label="c.label" :value="c.value" :icon="c.icon" :accent="c.accent" />
          </NuxtLink>
        </div>
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <NuxtLink v-for="c in opsCards" :key="c.label" :to="c.to" class="block">
            <StatCard :label="c.label" :value="c.value" :icon="c.icon" :accent="c.accent" />
          </NuxtLink>
        </div>
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard v-for="c in healthCards" :key="c.label" :label="c.label" :value="c.value" :icon="c.icon" :accent="c.accent" />
        </div>

        <div class="grid gap-4 xl:grid-cols-3">
          <section class="panel p-5">
            <h2 class="mb-4 font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted)">Accounts by platform</h2>
            <div v-if="!data.byPlatform?.length" class="py-6 text-center text-sm text-faint">No accounts yet.</div>
            <div v-else class="space-y-2">
              <div v-for="p in data.byPlatform" :key="p.name" class="flex items-center justify-between text-sm">
                <span class="text-foam">{{ p.name }}</span><span class="text-faint">{{ p.c }}</span>
              </div>
            </div>
          </section>
          <section class="panel p-5">
            <h2 class="mb-4 font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted)">Accounts by safe</h2>
            <div v-if="!data.bySafe?.length" class="py-6 text-center text-sm text-faint">No safes yet.</div>
            <div v-else class="space-y-2">
              <div v-for="s in data.bySafe" :key="s.name" class="flex items-center justify-between text-sm">
                <span class="text-foam">{{ s.name }}</span><span class="text-faint">{{ s.c }}</span>
              </div>
            </div>
          </section>
          <section class="panel p-5">
            <h2 class="mb-4 font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted)">Sessions by protocol</h2>
            <div v-if="!data.sessionsByProtocol?.length" class="py-6 text-center text-sm text-faint">No sessions yet.</div>
            <div v-else class="space-y-2">
              <div v-for="s in data.sessionsByProtocol" :key="s.protocol" class="flex items-center justify-between text-sm">
                <span class="text-foam uppercase">{{ s.protocol }}</span><span class="text-faint">{{ s.c }}</span>
              </div>
            </div>
          </section>
        </div>

        <section class="panel p-5">
          <div class="mb-4 flex items-center justify-between">
            <h2 class="font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted)">Recent critical events</h2>
            <NuxtLink to="/pam/audit" class="text-xs text-beacon hover:underline">Audit trail →</NuxtLink>
          </div>
          <div v-if="!data.recentEvents?.length" class="py-6 text-center text-sm text-faint">No high-severity events. 🎉</div>
          <table v-else class="w-full text-left text-sm">
            <tbody class="divide-y divide-surface">
              <tr v-for="e in data.recentEvents" :key="e.id" class="hover:bg-surface-2/40">
                <td class="py-2 pr-2"><span class="rounded px-1.5 py-0.5 text-xs" :class="severityMeta(e.severity).badge">{{ severityMeta(e.severity).label }}</span></td>
                <td class="py-2 pr-2 font-mono text-xs text-foam">{{ e.action }}</td>
                <td class="py-2 pr-2 text-(--color-muted)">{{ e.actor }}</td>
                <td class="py-2 text-right text-xs text-faint">{{ shortTime(e.ts) }}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
    </DataState>
  </div>
</template>
