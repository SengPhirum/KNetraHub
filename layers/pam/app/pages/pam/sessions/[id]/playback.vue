<script setup lang="ts">
// Session playback: replays the stored asciicast recording into an xterm
// terminal with play/pause/seek/speed, shows command + investigation markers,
// and lets an authorized reviewer independently re-verify integrity. Bytes are
// streamed from the control plane (object-store credentials never exposed).
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'

definePageMeta({ layout: false })
const route = useRoute()
const sessionId = String(route.params.id)

interface Frame { t: number; data: string }
const frames = ref<Frame[]>([])
const duration = ref(0)
const position = ref(0)
const playing = ref(false)
const speed = ref(1)
const loadError = ref('')
const loading = ref(true)
const termEl = ref<HTMLElement | null>(null)
const meta = ref<any>(null)
const markers = ref<any[]>([])
const integrity = ref<{ ok?: boolean; detail?: string; checking?: boolean }>({})

let term: any = null
let fit: any = null
let raf: any = null
let idx = 0
let playClock = 0

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const integrityColor = computed(() => integrity.value.ok === true ? 'success' : integrity.value.ok === false ? 'error' : 'neutral')

function renderUpTo(target: number) {
  term?.reset()
  for (const f of frames.value) { if (f.t <= target) term?.write(f.data); else break }
}

function seek(to: number) {
  position.value = to
  idx = frames.value.findIndex((f) => f.t > to)
  if (idx < 0) idx = frames.value.length
  renderUpTo(to)
}

function loop(ts: number) {
  if (!playing.value) return
  if (!playClock) playClock = ts
  const delta = (ts - playClock) / 1000 * speed.value
  playClock = ts
  position.value = Math.min(duration.value, position.value + delta)
  while (idx < frames.value.length && frames.value[idx]!.t <= position.value) { term?.write(frames.value[idx]!.data); idx++ }
  if (position.value >= duration.value || idx >= frames.value.length) { playing.value = false; return }
  raf = requestAnimationFrame(loop)
}

function togglePlay() {
  if (playing.value) { playing.value = false; if (raf) cancelAnimationFrame(raf); return }
  if (position.value >= duration.value) { seek(0) }
  playing.value = true; playClock = 0; raf = requestAnimationFrame(loop)
}

async function verify() {
  integrity.value = { checking: true }
  try {
    const r = await $fetch<{ ok: boolean; detail: string }>(`/api/pam/v1/sessions/${sessionId}/recording/verify`, { method: 'POST' })
    integrity.value = { ok: r.ok, detail: r.detail }
  } catch (e: any) { integrity.value = { ok: false, detail: e?.data?.statusMessage || 'verify failed' } }
}

onMounted(async () => {
  if (!import.meta.client) return
  try {
    const detailRes = await $fetch<any>(`/api/pam/v1/sessions/${sessionId}`)
    meta.value = detailRes.recordings?.[0] || null
    markers.value = detailRes.markers || []
    const text = await $fetch<string>(`/api/pam/v1/sessions/${sessionId}/recording`, { responseType: 'text' })
    const parsed: Frame[] = []
    for (const line of String(text).split('\n')) {
      if (!line.trim()) continue
      try { const a = JSON.parse(line); if (Array.isArray(a) && a.length >= 3 && a[1] === 'o') parsed.push({ t: Number(a[0]), data: String(a[2]) }) } catch { /* header/non-frame */ }
    }
    frames.value = parsed
    duration.value = parsed.length ? parsed[parsed.length - 1]!.t : 0

    const [{ Terminal }, { FitAddon }] = await Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit')])
    await import('@xterm/xterm/css/xterm.css')
    term = new Terminal({ fontFamily: 'ui-monospace, monospace', fontSize: 13, theme: { background: '#0b0f19' }, disableStdin: true })
    fit = new FitAddon(); term.loadAddon(fit); term.open(termEl.value!); fit.fit()
  } catch (e: any) {
    loadError.value = e?.data?.statusMessage || e?.message || 'Could not load recording'
  } finally { loading.value = false }
})

onBeforeUnmount(() => { if (raf) cancelAnimationFrame(raf); try { term?.dispose() } catch {} })
</script>

<template>
  <div class="p-4 max-w-5xl mx-auto space-y-4">
    <div class="flex items-center gap-3">
      <UButton icon="i-lucide-arrow-left" variant="ghost" size="sm" :to="`/pam/sessions/${sessionId}`">Session</UButton>
      <h1 class="text-lg font-semibold">Session playback</h1>
      <UBadge :color="integrityColor" variant="subtle" class="ml-auto">
        Integrity: {{ integrity.ok === true ? 'verified' : integrity.ok === false ? 'FAILED' : (meta?.integrity_ok ? 'recorded-ok' : 'unknown') }}
      </UBadge>
      <UButton size="sm" variant="soft" :loading="integrity.checking" icon="i-lucide-shield-check" @click="verify">Verify integrity</UButton>
    </div>

    <UAlert v-if="loadError" color="error" variant="subtle" :title="loadError" icon="i-lucide-triangle-alert" />
    <UAlert v-if="integrity.detail" :color="integrityColor" variant="subtle" :description="integrity.detail" />

    <div class="rounded-lg overflow-hidden border border-default bg-[#0b0f19]">
      <div ref="termEl" class="h-[420px] p-2" />
    </div>

    <div class="flex items-center gap-3">
      <UButton :icon="playing ? 'i-lucide-pause' : 'i-lucide-play'" color="primary" :disabled="loading || !frames.length" @click="togglePlay" />
      <span class="text-sm tabular-nums text-muted">{{ fmt(position) }} / {{ fmt(duration) }}</span>
      <input type="range" min="0" :max="duration || 1" step="0.1" :value="position" class="flex-1"
        @input="(e) => seek(Number((e.target as HTMLInputElement).value))" />
      <USelect v-model="speed" :items="[{ label: '1×', value: 1 }, { label: '2×', value: 2 }, { label: '4×', value: 4 }]" size="sm" class="w-20" />
    </div>

    <div v-if="markers.length" class="text-sm">
      <div class="font-medium mb-1">Markers</div>
      <div class="flex flex-wrap gap-2">
        <UButton v-for="m in markers" :key="m.id" size="xs" variant="soft" :color="m.kind === 'risk' ? 'error' : 'neutral'"
          @click="seek((m.offset_ms || 0) / 1000)">{{ fmt((m.offset_ms || 0) / 1000) }} · {{ m.label }}</UButton>
      </div>
    </div>
  </div>
</template>
