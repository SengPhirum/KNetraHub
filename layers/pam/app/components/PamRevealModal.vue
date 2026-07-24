<script setup lang="ts">
/**
 * Shared, hardened credential/secret reveal dialog (spec §5, §15). Security
 * properties enforced here so every reveal path is consistent:
 *   - a mandatory reason (audited server-side)
 *   - the plaintext is shown ONLY inside this modal, never written into a table
 *     row or anywhere it lingers in the page/scrollback
 *   - an auto-hide countdown, optional watermark, and policy copy-lock
 *   - STEP-UP: if the server answers 428 (stepUpRequired / securityPasswordRequired)
 *     we collect the security password via ConfirmPasswordModal and retry with the
 *     `x-confirm-password` header — the value is never fetched without it
 * The parent supplies `reveal(reason, headers)`; endpoint knowledge stays there.
 */
interface RevealResult {
  value: string
  valueType?: string
  version?: number
  displaySeconds?: number
  disableCopy?: boolean
  watermark?: string | null
  rotatingAfter?: boolean
  username?: string
}
const props = defineProps<{
  title?: string
  subject?: string
  reveal: (reason: string, headers: Record<string, string>) => Promise<RevealResult>
}>()
const open = defineModel<boolean>('open', { default: false })
const toast = useToast()

const reason = ref('')
const working = ref(false)
const result = ref<RevealResult | null>(null)
const countdown = ref(0)
const stepUpOpen = ref(false)
let timer: ReturnType<typeof setInterval> | null = null

function clearTimer() { if (timer) { clearInterval(timer); timer = null } }
function reset() { reason.value = ''; result.value = null; working.value = false; clearTimer() }
watch(open, (o) => { if (o) reset(); else { clearTimer(); result.value = null } })
onBeforeUnmount(clearTimer)

function show(res: RevealResult) {
  result.value = res
  countdown.value = res.displaySeconds || 30
  clearTimer()
  timer = setInterval(() => {
    countdown.value -= 1
    if (countdown.value <= 0) { result.value = null; clearTimer() }
  }, 1000)
}

function isStepUp(e: any): boolean {
  const d = e?.data?.data || e?.data
  return d?.stepUpRequired === true || d?.securityPasswordRequired === true || e?.statusCode === 428 || e?.data?.statusCode === 428
}

async function doReveal() {
  if (!reason.value.trim()) { toast.add({ title: 'A reason is required', color: 'error' }); return }
  working.value = true
  try {
    show(await props.reveal(reason.value.trim(), {}))
  } catch (e: any) {
    if (isStepUp(e)) { stepUpOpen.value = true; return }
    toast.add({ title: 'Reveal denied', description: e?.data?.statusMessage || e?.message, color: 'error' })
  } finally { working.value = false }
}

// Runs inside ConfirmPasswordModal — throwing keeps that modal open with the error.
async function stepUpAction(password: string) {
  show(await props.reveal(reason.value.trim(), { 'x-confirm-password': password }))
}

async function copyValue() {
  if (!result.value || result.value.disableCopy) return
  try { await navigator.clipboard?.writeText(result.value.value); toast.add({ title: 'Copied', color: 'success' }) }
  catch { toast.add({ title: 'Copy unavailable', color: 'warning' }) }
}
</script>

<template>
  <UModal v-model:open="open" :title="title || 'Reveal secret'" :dismissible="!working">
    <template #body>
      <div v-if="!result" class="space-y-3">
        <p class="text-xs text-faint">
          Revealing <span class="font-mono text-foam">{{ subject }}</span> is recorded in the audit trail.
          Prefer brokered connection / injection over reveal where possible.
        </p>
        <UFormField label="Reason" required>
          <UTextarea v-model="reason" :rows="2" class="w-full" autofocus placeholder="Why do you need this value now?" @keydown.enter.prevent="doReveal" />
        </UFormField>
      </div>
      <div v-else class="space-y-2">
        <p v-if="result.username" class="text-xs text-faint">Username <span class="font-mono text-foam">{{ result.username }}</span></p>
        <div class="panel-flush relative overflow-hidden rounded p-3">
          <p class="select-all break-all font-mono text-lg text-foam" :style="result.disableCopy ? 'user-select:none' : ''">{{ result.value }}</p>
          <p v-if="result.watermark" class="pointer-events-none absolute inset-0 flex items-center justify-center rotate-[-12deg] text-center text-xs text-faint/40">{{ result.watermark }}</p>
        </div>
        <div class="flex items-center justify-between text-xs">
          <span class="text-amber-400">Hiding in {{ countdown }}s{{ result.rotatingAfter ? ' · rotating after view' : '' }}</span>
          <UButton v-if="!result.disableCopy" size="xs" variant="ghost" icon="i-lucide-copy" @click="copyValue">Copy</UButton>
          <span v-else class="text-faint">Copy disabled by policy</span>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="open = false">{{ result ? 'Close' : 'Cancel' }}</UButton>
        <UButton v-if="!result" :loading="working" icon="i-lucide-eye" @click="doReveal">Reveal</UButton>
      </div>
    </template>
  </UModal>

  <ConfirmPasswordModal
    v-model:open="stepUpOpen"
    title="Step-up confirmation"
    message="This is a high-risk reveal and requires your security password."
    confirm-label="Confirm & reveal"
    :action="stepUpAction"
  />
</template>
