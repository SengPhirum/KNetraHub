<script setup lang="ts">
// Session detail — live metadata, command log, event timeline, recording
// metadata, investigation markers, and monitor controls (terminate, marker,
// disable account, rotate).
const route = useRoute()
const toast = useToast()
const { canTerminate, canMonitor, shortTime } = usePam()
const id = computed(() => String(route.params.id))

const { data, status, error, refresh } = useAsyncData(`pamSession-${id.value}`,
  () => $fetch<any>(`/api/pam/v1/sessions/${id.value}`), { server: false, default: () => null })

let poll: any = null
onMounted(() => { poll = setInterval(() => { if (['starting','active','idle'].includes(data.value?.session?.state)) refresh() }, 5000) })
onUnmounted(() => { if (poll) clearInterval(poll) })

const isLive = computed(() => ['starting', 'active', 'idle'].includes(data.value?.session?.state))
const markerLabel = ref('')

async function terminate(opts: any = {}) {
  try {
    await $fetch(`/api/pam/v1/sessions/${id.value}/terminate`, { method: 'POST', body: { reason: 'terminated from console', ...opts } })
    toast.add({ title: 'Session terminated', color: 'success' })
    await refresh()
  } catch (e: any) { toast.add({ title: 'Could not terminate', description: e?.data?.statusMessage, color: 'error' }) }
}
async function addMarker() {
  if (!markerLabel.value.trim()) return
  try {
    await $fetch(`/api/pam/v1/sessions/${id.value}/markers`, { method: 'POST', body: { label: markerLabel.value } })
    markerLabel.value = ''
    await refresh()
  } catch (e: any) { toast.add({ title: 'Could not add marker', description: e?.data?.statusMessage, color: 'error' }) }
}
</script>

<template>
  <div>
    <UButton to="/pam/sessions" icon="i-lucide-arrow-left" variant="ghost" size="xs" class="mb-2">Sessions</UButton>
    <DataState :status="status" :error="error">
      <div v-if="data" class="space-y-5">
        <PageHeader :title="`Session ${id.slice(0,8)}`" :subtitle="`${data.session.principal} → ${data.session.target || data.session.account_id} (${data.session.protocol})`" icon="i-lucide-monitor-play">
          <template v-if="canTerminate && isLive" #actions>
            <UButton color="error" icon="i-lucide-power" size="sm" @click="terminate()">Terminate</UButton>
            <UButton color="error" variant="soft" icon="i-lucide-rotate-cw" size="sm" @click="terminate({ rotate_credential: true })">Terminate + rotate</UButton>
          </template>
        </PageHeader>

        <div class="grid gap-4 lg:grid-cols-3">
          <section class="panel space-y-2 p-5">
            <h2 class="mb-1 font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted)">Session</h2>
            <div class="text-sm space-y-1">
              <div><span class="text-faint">State:</span> {{ data.session.state }}</div>
              <div><span class="text-faint">Source IP:</span> {{ data.session.source_ip || '—' }}</div>
              <div><span class="text-faint">Recording:</span> {{ data.session.recording_status }}</div>
              <div><span class="text-faint">Started:</span> {{ shortTime(data.session.started_at) }}</div>
              <div v-if="data.session.ended_at"><span class="text-faint">Ended:</span> {{ shortTime(data.session.ended_at) }}</div>
              <div v-if="data.session.termination_reason"><span class="text-faint">Reason:</span> {{ data.session.termination_reason }}</div>
            </div>
          </section>

          <section class="panel p-5 lg:col-span-2">
            <h2 class="mb-2 font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted)">Command log</h2>
            <div v-if="!data.commands?.length" class="py-4 text-center text-sm text-faint">No commands recorded (requires the session gateway).</div>
            <div v-else class="max-h-64 overflow-y-auto rounded bg-black/30 p-3 font-mono text-xs">
              <div v-for="c in data.commands" :key="c.id" :class="c.blocked ? 'text-rose-400' : 'text-emerald-300'">
                <span class="text-faint">{{ c.seq }}</span> {{ c.command }}<span v-if="c.blocked"> [blocked]</span>
              </div>
            </div>
          </section>
        </div>

        <div class="grid gap-4 lg:grid-cols-2">
          <section class="panel p-5">
            <h2 class="mb-2 font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted)">Recordings</h2>
            <ul v-if="data.recordings?.length" class="space-y-2 text-sm">
              <li v-for="r in data.recordings" :key="r.id" class="flex items-center justify-between">
                <span class="text-foam">{{ r.format }} · {{ r.duration_ms ? Math.round(r.duration_ms/1000)+'s' : '—' }}</span>
                <span class="text-xs" :class="r.integrity_ok ? 'text-emerald-400' : 'text-faint'">{{ r.integrity_ok ? 'integrity ✓' : 'unverified' }}</span>
              </li>
            </ul>
            <p v-else class="py-4 text-center text-sm text-faint">No recording yet.</p>
          </section>
          <section class="panel p-5">
            <div class="mb-2 flex items-center justify-between">
              <h2 class="font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted)">Investigation markers</h2>
            </div>
            <ul class="mb-3 space-y-1 text-sm">
              <li v-for="m in data.markers" :key="m.id" class="text-(--color-muted)">• {{ m.label }} <span class="text-xs text-faint">({{ m.created_by }})</span></li>
              <li v-if="!data.markers?.length" class="text-faint">None.</li>
            </ul>
            <div v-if="canMonitor" class="flex gap-2">
              <UInput v-model="markerLabel" size="sm" placeholder="Add a marker" class="flex-1" @keydown.enter="addMarker" />
              <UButton size="sm" icon="i-lucide-plus" @click="addMarker">Mark</UButton>
            </div>
          </section>
        </div>
      </div>
    </DataState>
  </div>
</template>
