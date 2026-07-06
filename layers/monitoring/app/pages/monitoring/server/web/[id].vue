<script setup lang="ts">
// Web scenario detail: ordered steps (Zabbix multi-step web check) with per-step
// last result, plus add/remove steps.
const route = useRoute()
const { hasApp, hasPermission } = useAuth()
const toast = useToast()
const canManage = computed(() => hasPermission('monitoring.manage'))

const { data: scenario, refresh } = useAsyncData(`serverWeb-${route.params.id}`, () => $fetch<any>(`/api/server/web/${route.params.id}`), { server: false })
onMounted(() => { const t = setInterval(refresh, 15000); onUnmounted(() => clearInterval(t)) })

const stepForm = reactive({ name: '', url: '', expected_status: 200, required_string: '' })
const adding = ref(false)
async function addStep() {
  if (!stepForm.name.trim() || !stepForm.url.trim()) { toast.add({ title: 'Name and URL required', color: 'error' }); return }
  adding.value = true
  try {
    await $fetch(`/api/server/web/${route.params.id}/steps`, { method: 'POST', body: { ...stepForm } })
    Object.assign(stepForm, { name: '', url: '', expected_status: 200, required_string: '' })
    await refresh()
  } catch (e: any) { toast.add({ title: 'Failed', description: e?.data?.statusMessage, color: 'error' }) }
  finally { adding.value = false }
}
async function delStep(s: any) { await $fetch(`/api/server/web/steps/${s.id}`, { method: 'DELETE' }); await refresh() }

function stepColor(s: any) { return s.last_status === 'up' ? 'success' : s.last_status === 'down' ? 'error' : 'neutral' }
</script>

<template>
  <div>
    <NuxtLink to="/monitoring/server/web" class="mb-3 inline-flex items-center gap-1 text-sm text-(--color-muted) hover:text-foam transition">
      <UIcon name="i-lucide-arrow-left" class="size-4" /> Web monitoring
    </NuxtLink>

    <div v-if="!hasApp('monitoring')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-Monitoring.</p>
    </div>

    <div v-else-if="!scenario" class="panel p-10 text-center text-faint text-sm">Loading…</div>

    <div v-else class="space-y-6">
      <div class="panel p-5 flex flex-wrap items-center gap-x-8 gap-y-3">
        <div><h1 class="font-display text-lg font-semibold text-foam">{{ scenario.name }}</h1><p class="text-xs text-faint">{{ scenario.host_name || 'No host' }}</p></div>
        <div><span class="text-xs uppercase text-(--color-muted)">Status</span><p class="mt-1"><UBadge :color="stepColor(scenario)" variant="subtle" size="sm">{{ scenario.last_status || 'pending' }}</UBadge></p></div>
        <div><span class="text-xs uppercase text-(--color-muted)">Total latency</span><p class="mt-1 text-sm text-foam">{{ scenario.last_ms != null ? Math.round(scenario.last_ms) + ' ms' : '—' }}</p></div>
        <div><span class="text-xs uppercase text-(--color-muted)">Steps</span><p class="mt-1 text-sm text-foam">{{ scenario.steps.length }}</p></div>
        <div><span class="text-xs uppercase text-(--color-muted)">Checked</span><p class="mt-1 text-sm text-foam">{{ scenario.last_check ? new Date(scenario.last_check).toLocaleString() : '—' }}</p></div>
      </div>

      <div class="panel p-5">
        <h2 class="font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted) mb-3">Steps</h2>
        <table class="w-full text-left text-sm text-(--color-muted)">
          <thead class="text-xs uppercase text-faint"><tr><th class="py-2 w-8">#</th><th>Status</th><th>Name</th><th>URL</th><th>Expect</th><th>Match</th><th>Code</th><th>Latency</th><th></th></tr></thead>
          <tbody class="divide-y divide-surface">
            <tr v-for="s in scenario.steps" :key="s.id">
              <td class="py-2 text-faint">{{ s.step_no }}</td>
              <td><UBadge :color="stepColor(s)" variant="subtle" size="xs">{{ s.last_status || '—' }}</UBadge></td>
              <td class="text-foam">{{ s.name }}</td>
              <td class="font-mono text-xs truncate max-w-[16rem]" :title="s.url">{{ s.url }}</td>
              <td>{{ s.expected_status }}</td>
              <td class="text-xs">{{ s.required_string || '—' }}</td>
              <td>{{ s.last_code ?? '—' }}</td>
              <td>{{ s.last_ms != null ? Math.round(s.last_ms) + ' ms' : '—' }}</td>
              <td class="text-right"><UButton v-if="canManage && scenario.steps.length > 1" size="xs" variant="ghost" color="error" icon="i-lucide-x" @click="delStep(s)" /></td>
            </tr>
          </tbody>
        </table>

        <div v-if="canManage" class="mt-3 grid gap-2 sm:grid-cols-5 items-end border-t border-hull pt-3">
          <UFormField label="Name" size="xs"><UInput v-model="stepForm.name" size="xs" class="w-full" placeholder="Login" /></UFormField>
          <UFormField label="URL" size="xs" class="sm:col-span-2"><UInput v-model="stepForm.url" size="xs" class="w-full" placeholder="https://…" /></UFormField>
          <UFormField label="Expect" size="xs"><UInput v-model.number="stepForm.expected_status" type="number" size="xs" class="w-full" /></UFormField>
          <UFormField label="Must contain" size="xs"><UInput v-model="stepForm.required_string" size="xs" class="w-full" placeholder="optional" /></UFormField>
          <UButton size="xs" color="primary" icon="i-lucide-plus" class="sm:col-span-5 justify-center" :loading="adding" @click="addStep">Add step</UButton>
        </div>
      </div>
    </div>
  </div>
</template>
