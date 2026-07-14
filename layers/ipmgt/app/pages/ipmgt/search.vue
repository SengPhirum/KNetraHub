<script setup lang="ts">
// Global IPAM search: addresses, subnets (incl. CIDR containment), VLANs, VRFs,
// sections — categorized results from /api/ipmgt/search.
const { hasApp } = useAuth()
const term = ref('')
const results = ref<any>(null)
const searching = ref(false)

async function run() {
  const q = term.value.trim()
  if (!q) { results.value = null; return }
  searching.value = true
  try {
    results.value = await $fetch<any>(`/api/ipmgt/search?q=${encodeURIComponent(q)}`)
  } finally { searching.value = false }
}
const total = computed(() => {
  const r = results.value
  if (!r) return 0
  return (r.addresses?.length || 0) + (r.subnets?.length || 0) + (r.containingSubnets?.length || 0) + (r.vlans?.length || 0) + (r.vrfs?.length || 0)
    + (r.sections?.length || 0) + (r.devices?.length || 0) + (r.locations?.length || 0) + (r.customers?.length || 0)
})
</script>

<template>
  <div>
    <PageHeader title="Search" subtitle="Find IPs, subnets, VLANs, VRFs and sections" icon="i-lucide-search" />

    <div v-if="!hasApp('ipmgt')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-IPMgt.</p>
    </div>

    <div v-else class="space-y-5">
      <div class="flex items-center gap-2">
        <UInput v-model="term" icon="i-lucide-search" size="lg" placeholder="10.0.1.10, web-01, 00:1A:2B, VLAN 10, 10.0.0.0/16…" class="max-w-xl flex-1" autofocus @keyup.enter="run" />
        <UButton size="lg" :loading="searching" @click="run">Search</UButton>
      </div>

      <div v-if="results" class="space-y-5">
        <p class="text-xs text-faint">{{ total }} result{{ total === 1 ? '' : 's' }} for “{{ results.query }}”.</p>

        <section v-if="results.containingSubnets?.length" class="panel p-4">
          <h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-(--color-muted)">Subnets containing this address/range</h3>
          <div class="flex flex-wrap gap-2">
            <NuxtLink v-for="s in results.containingSubnets" :key="s.id" :to="`/ipmgt/subnets/${s.id}`" class="rounded-md bg-surface-2 px-2.5 py-1 font-mono text-xs text-beacon hover:underline">{{ s.network }} · {{ s.name }}</NuxtLink>
          </div>
        </section>

        <section v-if="results.addresses?.length" class="panel p-4">
          <h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-(--color-muted)">Addresses</h3>
          <table class="w-full text-left text-sm">
            <tbody class="divide-y divide-surface">
              <tr v-for="a in results.addresses" :key="a.id" class="hover:bg-surface-2/40">
                <td class="py-2 pr-3 font-mono text-foam">{{ a.ip }}</td>
                <td class="py-2 pr-3 text-(--color-muted)">{{ a.hostname || '—' }}</td>
                <td class="py-2 pr-3"><IpamIpStatusBadge :status="a.status" /></td>
                <td class="py-2 text-right">
                  <NuxtLink :to="`/ipmgt/subnets/${a.subnet_id}`" class="text-xs text-beacon hover:underline">{{ a.subnet_name || 'subnet' }}</NuxtLink>
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section v-if="results.subnets?.length" class="panel p-4">
          <h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-(--color-muted)">Subnets</h3>
          <div class="flex flex-wrap gap-2">
            <NuxtLink v-for="s in results.subnets" :key="s.id" :to="`/ipmgt/subnets/${s.id}`" class="rounded-md bg-surface-2 px-2.5 py-1 text-xs hover:text-beacon"><span class="font-mono text-foam">{{ s.network }}</span> · {{ s.name }}</NuxtLink>
          </div>
        </section>

        <div class="grid gap-5 sm:grid-cols-3">
          <section v-if="results.vlans?.length" class="panel p-4">
            <h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-(--color-muted)">VLANs</h3>
            <NuxtLink v-for="v in results.vlans" :key="v.id" to="/ipmgt/vlans" class="block py-1 text-sm hover:text-beacon"><span class="font-mono text-foam">{{ v.vlan_id }}</span> · {{ v.name }}</NuxtLink>
          </section>
          <section v-if="results.vrfs?.length" class="panel p-4">
            <h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-(--color-muted)">VRFs</h3>
            <NuxtLink v-for="v in results.vrfs" :key="v.id" to="/ipmgt/vrfs" class="block py-1 text-sm text-foam hover:text-beacon">{{ v.name }}</NuxtLink>
          </section>
          <section v-if="results.sections?.length" class="panel p-4">
            <h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-(--color-muted)">Sections</h3>
            <NuxtLink v-for="s in results.sections" :key="s.id" :to="`/ipmgt/subnets?section_id=${s.id}`" class="block py-1 text-sm text-foam hover:text-beacon">{{ s.name }}</NuxtLink>
          </section>
        </div>

        <div class="grid gap-5 sm:grid-cols-3">
          <section v-if="results.devices?.length" class="panel p-4">
            <h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-(--color-muted)">Devices</h3>
            <NuxtLink v-for="d in results.devices" :key="d.id" to="/ipmgt/devices" class="block py-1 text-sm text-foam hover:text-beacon">{{ d.hostname }} <span v-if="d.management_ip" class="font-mono text-xs text-faint">{{ d.management_ip }}</span></NuxtLink>
          </section>
          <section v-if="results.locations?.length" class="panel p-4">
            <h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-(--color-muted)">Locations</h3>
            <NuxtLink v-for="l in results.locations" :key="l.id" to="/ipmgt/locations" class="block py-1 text-sm text-foam hover:text-beacon">{{ l.name }}</NuxtLink>
          </section>
          <section v-if="results.customers?.length" class="panel p-4">
            <h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-(--color-muted)">Customers</h3>
            <NuxtLink v-for="c in results.customers" :key="c.id" to="/ipmgt/customers" class="block py-1 text-sm text-foam hover:text-beacon">{{ c.name }}</NuxtLink>
          </section>
        </div>

        <div v-if="!total" class="panel p-10 text-center text-sm text-faint">No matches.</div>
      </div>
    </div>
  </div>
</template>
