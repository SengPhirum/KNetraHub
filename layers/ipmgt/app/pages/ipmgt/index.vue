<script setup lang="ts">
// IPAM dashboard: address-space totals, IPv4/IPv6 usage, status breakdown,
// high-usage subnets, per-section usage, and recent activity. Server-backed by
// /api/ipmgt/dashboard.
const { hasApp, hasPermission } = useAuth()

const { data, status, error } = useAsyncData('ipamDashboard',
  () => $fetch<any>('/api/ipmgt/dashboard'),
  { server: false, default: () => null }
)

const canCreate = computed(() => hasPermission('ipmgt.create'))

const statusOrder = ['used', 'reserved', 'dhcp', 'offline', 'deprecated', 'gateway']
const statusCards = computed(() =>
  statusOrder.map((k) => ({ ...ipStatusMeta(k), count: data.value?.statusSummary?.[k] ?? 0 }))
)

function fmt(n: number | string | undefined): string {
  const v = Number(n || 0)
  return v.toLocaleString()
}
</script>

<template>
  <div>
    <PageHeader title="IPAM Dashboard" subtitle="IP Address Management overview" icon="i-lucide-layout-dashboard">
      <template v-if="hasApp('ipmgt') && canCreate" #actions>
        <div class="flex items-center gap-2">
          <UButton to="/ipmgt/subnets" icon="i-lucide-network" size="sm" color="neutral" variant="soft">Subnets</UButton>
          <UButton to="/ipmgt/sections" icon="i-lucide-plus" size="sm">Manage sections</UButton>
        </div>
      </template>
    </PageHeader>

    <div v-if="!hasApp('ipmgt')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-IPMgt.</p>
    </div>

    <DataState v-else :status="status" :error="error">
      <div v-if="data" class="space-y-6">
        <!-- Top counters -->
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Sections" :value="data.counts.sections" icon="i-lucide-folder-tree" />
          <StatCard label="Subnets" :value="data.counts.subnets" icon="i-lucide-network" />
          <StatCard label="Allocated addresses" :value="fmt(data.counts.addresses)" icon="i-lucide-list-ordered" accent />
          <StatCard label="VLANs / VRFs" :value="`${data.counts.vlans} / ${data.counts.vrfs}`" icon="i-lucide-layers" />
        </div>

        <!-- IPv4 capacity + status breakdown -->
        <div class="grid gap-4 xl:grid-cols-3">
          <section class="panel p-5 xl:col-span-2">
            <div class="mb-4 flex items-center justify-between">
              <h2 class="font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted)">IPv4 address space</h2>
              <span class="text-xs text-faint">{{ data.ipv4.subnets }} subnets · {{ data.ipv6.subnets }} IPv6 subnets</span>
            </div>
            <div class="flex items-end justify-between gap-4">
              <div>
                <p class="font-display text-3xl font-bold text-foam">{{ data.ipv4.percent }}%</p>
                <p class="mt-1 text-xs text-(--color-muted)">{{ fmt(data.ipv4.used) }} used · {{ fmt(data.ipv4.free) }} free of {{ fmt(data.ipv4.capacity) }} usable</p>
              </div>
            </div>
            <div class="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
              <div class="h-full rounded-full transition-all" :class="usageBarClass(data.ipv4.percent)" :style="{ width: `${data.ipv4.percent}%` }" />
            </div>
          </section>

          <section class="panel p-5">
            <h2 class="mb-4 font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted)">Status summary</h2>
            <div class="grid grid-cols-2 gap-3">
              <div v-for="s in statusCards" :key="s.key" class="flex items-center gap-2">
                <span class="size-2.5 rounded-full" :class="s.dot" />
                <span class="text-sm text-foam">{{ s.count }}</span>
                <span class="text-xs text-faint">{{ s.label }}</span>
              </div>
            </div>
          </section>
        </div>

        <!-- High usage + by section -->
        <div class="grid gap-4 xl:grid-cols-2">
          <section class="panel p-5">
            <div class="mb-4 flex items-center justify-between">
              <h2 class="font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted)">
                High-usage subnets (≥ {{ data.highUsageThreshold }}%)
              </h2>
              <NuxtLink to="/ipmgt/subnets" class="text-xs text-beacon hover:underline">All subnets →</NuxtLink>
            </div>
            <div v-if="!data.highUsageSubnets.length" class="py-6 text-center text-sm text-faint">No subnets above the threshold. 🎉</div>
            <div v-else class="space-y-3">
              <NuxtLink v-for="s in data.highUsageSubnets" :key="s.id" :to="`/ipmgt/subnets/${s.id}`" class="block">
                <div class="mb-1 flex items-center justify-between text-sm">
                  <span class="font-medium text-foam">{{ s.name }} <span class="ml-1 font-mono text-xs text-faint">{{ s.network }}</span></span>
                  <span class="text-xs text-faint">{{ s.used }}/{{ s.capacity }} · {{ s.percent }}%</span>
                </div>
                <div class="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                  <div class="h-full rounded-full" :class="usageBarClass(s.percent)" :style="{ width: `${s.percent}%` }" />
                </div>
              </NuxtLink>
            </div>
          </section>

          <section class="panel p-5">
            <h2 class="mb-4 font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted)">Usage by section</h2>
            <div v-if="!data.bySection.length" class="py-6 text-center text-sm text-faint">No sections with subnets yet.</div>
            <div v-else class="space-y-3">
              <div v-for="s in data.bySection" :key="s.id">
                <div class="mb-1 flex items-center justify-between text-sm">
                  <span class="font-medium text-foam">{{ s.name }}</span>
                  <span class="text-xs text-faint">{{ fmt(s.used) }}/{{ fmt(s.capacity) }} · {{ s.percent }}%</span>
                </div>
                <div class="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                  <div class="h-full rounded-full" :class="usageBarClass(s.percent)" :style="{ width: `${s.percent}%` }" />
                </div>
              </div>
            </div>
          </section>
        </div>

        <!-- Recent activity -->
        <section class="panel p-5">
          <h2 class="mb-4 font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted)">Recent address activity</h2>
          <div v-if="!data.recent.length" class="py-6 text-center text-sm text-faint">No addresses recorded yet.</div>
          <table v-else class="w-full text-left text-sm">
            <thead class="text-xs uppercase text-faint">
              <tr>
                <th class="px-2 py-2 font-medium">Address</th>
                <th class="px-2 py-2 font-medium">Hostname</th>
                <th class="px-2 py-2 font-medium">Subnet</th>
                <th class="px-2 py-2 font-medium">Status</th>
                <th class="px-2 py-2 font-medium">When</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-surface">
              <tr v-for="r in data.recent" :key="r.id" class="hover:bg-surface-2/40">
                <td class="px-2 py-2 font-mono text-foam">{{ r.ip }}</td>
                <td class="px-2 py-2 text-(--color-muted)">{{ r.hostname || '—' }}</td>
                <td class="px-2 py-2 text-(--color-muted)">{{ r.subnet_name || '—' }}</td>
                <td class="px-2 py-2"><IpamIpStatusBadge :status="r.status" /></td>
                <td class="px-2 py-2 text-xs text-faint">{{ (r.updated_at || r.created_at || '').slice(0, 16).replace('T', ' ') }}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
    </DataState>
  </div>
</template>
