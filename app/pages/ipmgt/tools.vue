<script setup lang="ts">
// IPv4/IPv6 subnet calculator + split planner, backed by /api/ipmgt/calculator.
const { hasApp } = useAuth()
const cidr = ref('192.168.1.0/24')
const splitTo = ref<number | ''>('')
const result = ref<any>(null)
const errMsg = ref('')
const loading = ref(false)

async function calc() {
  if (!cidr.value.trim()) return
  loading.value = true
  errMsg.value = ''
  try {
    const url = `/api/ipmgt/calculator?cidr=${encodeURIComponent(cidr.value.trim())}${splitTo.value ? `&split=${splitTo.value}` : ''}`
    result.value = await $fetch<any>(url)
  } catch (e: any) {
    result.value = null
    errMsg.value = e?.data?.statusMessage || 'Invalid input'
  } finally { loading.value = false }
}

const facts = computed(() => {
  const r = result.value
  if (!r) return []
  const base = [
    ['Network', r.network], ['Prefix', `/${r.prefix}`], ['Netmask', r.netmask],
    ['Broadcast / last', r.broadcast], ['First usable', r.firstUsable], ['Last usable', r.lastUsable],
    ['Total addresses', r.total], ['Usable hosts', r.usable]
  ]
  if (r.version === 4) base.splice(3, 0, ['Wildcard', r.wildcard])
  return base
})

onMounted(calc)
</script>

<template>
  <div>
    <PageHeader title="IP Calculator" subtitle="Subnet facts and split planning for IPv4 & IPv6" icon="i-lucide-calculator" />

    <div v-if="!hasApp('ipmgt')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-IPMgt.</p>
    </div>

    <div v-else class="space-y-5">
      <div class="panel p-5">
        <div class="flex flex-wrap items-end gap-3">
          <UFormField label="CIDR" class="flex-1 min-w-[220px]">
            <UInput v-model="cidr" placeholder="192.168.1.0/24 or 2001:db8::/48" class="w-full font-mono" @keyup.enter="calc" />
          </UFormField>
          <UFormField label="Split into prefix (optional)">
            <UInput v-model.number="splitTo" type="number" placeholder="26" class="w-32" @keyup.enter="calc" />
          </UFormField>
          <UButton size="md" :loading="loading" icon="i-lucide-calculator" @click="calc">Calculate</UButton>
        </div>
        <p v-if="errMsg" class="mt-3 text-sm text-rose-400">{{ errMsg }}</p>
      </div>

      <div v-if="result" class="grid gap-4 xl:grid-cols-2">
        <section class="panel p-5">
          <div class="mb-3 flex items-center gap-2">
            <h2 class="font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted)">Results</h2>
            <UBadge :color="result.version === 6 ? 'info' : 'primary'" variant="subtle" size="xs">IPv{{ result.version }}</UBadge>
          </div>
          <dl class="grid grid-cols-2 gap-x-6 gap-y-3">
            <div v-for="[k, v] in facts" :key="k">
              <dt class="text-xs text-faint">{{ k }}</dt>
              <dd class="font-mono text-sm text-foam break-all">{{ v }}</dd>
            </div>
          </dl>
        </section>

        <section v-if="result.split" class="panel p-5">
          <h2 class="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted)">
            Split → /{{ result.split.newPrefix }} ({{ result.split.totalChildren }} subnets)
          </h2>
          <p v-if="result.split.truncated" class="mb-2 text-xs text-amber-400">Showing first 256.</p>
          <div class="max-h-80 space-y-1 overflow-y-auto pr-1">
            <div v-for="s in result.split.subnets" :key="s.cidr" class="rounded-md bg-surface-2/50 px-2.5 py-1 font-mono text-xs text-foam">{{ s.cidr }}</div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
