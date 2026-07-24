<script setup lang="ts">
// Browser SSH terminal. Fetches a fresh one-time gateway token, opens the app
// WebSocket proxy (which pipes to the internal SSH gateway), and renders a live
// xterm terminal. The target credential never reaches the browser — the gateway
// injects it server-side. Recording + monitoring are enforced by the gateway.
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'

definePageMeta({ layout: false })

const route = useRoute()
const { user } = useAuth()
const sessionId = String(route.params.id)

const state = ref<'connecting' | 'connected' | 'closed' | 'error'>('connecting')
const detail = ref('')
const startedAt = ref<number>(Date.now())
const elapsed = ref('00:00')
const termEl = ref<HTMLElement | null>(null)
const watermark = computed(() => `${user.value?.username || 'user'} · ${sessionId.slice(0, 8)} · ${new Date().toISOString().slice(0, 19)}Z`)

let term: any = null
let fit: any = null
let ws: WebSocket | null = null
let timer: any = null
let resizeHandler: (() => void) | null = null

const stateColor = computed(() => ({ connecting: 'warning', connected: 'success', closed: 'neutral', error: 'error' }[state.value] as any))

function tick() {
  const s = Math.floor((Date.now() - startedAt.value) / 1000)
  elapsed.value = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

async function connect() {
  state.value = 'connecting'; detail.value = ''
  try {
    const res = await $fetch<{ gatewayToken: string }>(`/api/pam/v1/sessions/${sessionId}/token`, { method: 'POST' })
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    ws = new WebSocket(`${proto}://${location.host}/pam-ws/session/${sessionId}?token=${encodeURIComponent(res.gatewayToken)}`)
    ws.binaryType = 'arraybuffer'
    ws.onopen = () => { state.value = 'connected'; startedAt.value = Date.now(); term?.focus() }
    ws.onmessage = (e) => {
      const data = typeof e.data === 'string' ? e.data : new Uint8Array(e.data)
      term?.write(data)
    }
    ws.onclose = () => { if (state.value !== 'error') { state.value = 'closed'; detail.value = 'Session closed.' } }
    ws.onerror = () => { state.value = 'error'; detail.value = 'Connection error.' }
  } catch (e: any) {
    state.value = 'error'
    detail.value = e?.data?.statusMessage || e?.message || 'Failed to obtain a session token (grant expired or revoked?)'
  }
}

function disconnect() {
  try { ws?.close() } catch {}
  state.value = 'closed'
}

onMounted(async () => {
  if (!import.meta.client) return
  const [{ Terminal }, { FitAddon }] = await Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit')])
  // xterm stylesheet (loaded lazily so it only affects this page).
  await import('@xterm/xterm/css/xterm.css')
  term = new Terminal({ cursorBlink: true, fontFamily: 'ui-monospace, monospace', fontSize: 13, theme: { background: '#0b0f19' } })
  fit = new FitAddon()
  term.loadAddon(fit)
  term.open(termEl.value!)
  fit.fit()
  term.onData((d: string) => { if (ws?.readyState === 1) ws.send(d) })
  resizeHandler = () => { try { fit.fit() } catch {} }
  window.addEventListener('resize', resizeHandler)
  timer = setInterval(tick, 1000)
  await connect()
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
  if (resizeHandler) window.removeEventListener('resize', resizeHandler)
  try { ws?.close() } catch {}
  try { term?.dispose() } catch {}
})
</script>

<template>
  <div class="flex flex-col h-[calc(100vh-4rem)]">
    <div class="flex items-center gap-3 px-4 py-2 border-b border-default bg-elevated/50">
      <UButton icon="i-lucide-arrow-left" variant="ghost" size="sm" :to="`/pam/sessions/${sessionId}`">Session</UButton>
      <UBadge :color="stateColor" variant="subtle" class="capitalize">{{ state }}</UBadge>
      <span class="text-sm text-muted">Session {{ sessionId.slice(0, 8) }}</span>
      <div class="flex items-center gap-1 text-sm text-muted">
        <UIcon name="i-lucide-timer" /> {{ elapsed }}
      </div>
      <UBadge color="error" variant="subtle" size="sm"><UIcon name="i-lucide-circle" class="animate-pulse" /> REC</UBadge>
      <div class="ml-auto flex items-center gap-2">
        <UButton v-if="state === 'closed' || state === 'error'" size="sm" color="primary" icon="i-lucide-rotate-cw" @click="connect">Reconnect</UButton>
        <UButton size="sm" color="error" variant="soft" icon="i-lucide-power" @click="disconnect">Disconnect</UButton>
      </div>
    </div>
    <div v-if="detail" class="px-4 py-2 text-sm text-warning bg-warning/10">{{ detail }}</div>
    <div class="relative flex-1 min-h-0 bg-[#0b0f19]">
      <div ref="termEl" class="absolute inset-0 p-2" />
      <!-- Investigation watermark overlay -->
      <div class="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.06] select-none">
        <div class="text-2xl font-bold rotate-[-20deg] whitespace-nowrap">{{ watermark }}</div>
      </div>
    </div>
  </div>
</template>
