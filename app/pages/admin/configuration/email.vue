<script setup lang="ts">
// Admin > Configuration > Email. Two tabs: General (the SMTP transport, plus
// a send-test that runs against the unsaved form so a relay can be verified
// before it is committed) and Templates (the content of every message the
// portal sends, authored in Markdown or hand-written HTML).
//
// The preview is rendered server-side through the same renderEmail() used for
// a real send, so what an admin sees is byte-for-byte what a recipient gets.
definePageMeta({ middleware: 'admin' })

import { variablesForTemplate, type EmailTemplate, type EmailTemplateVariable } from '~~/shared/utils/emailTemplates'

const toast = useToast()

const tab = ref<'general' | 'templates'>('general')
const tabs: Array<[typeof tab.value, string, string]> = [
  ['general', 'General', 'i-lucide-server-cog'],
  ['templates', 'Templates', 'i-lucide-layout-template']
]

// ── General: SMTP transport ───────────────────────────────────────────────
interface EmailSettingsForm {
  enabled: boolean
  host: string
  port: number
  encryption: 'none' | 'starttls' | 'ssl'
  username: string
  password: string
  fromName: string
  fromAddress: string
  replyTo: string
  allowInsecureTls: boolean
}

const form = reactive<EmailSettingsForm>({
  enabled: false,
  host: '',
  port: 587,
  encryption: 'starttls',
  username: '',
  password: '',
  fromName: '',
  fromAddress: '',
  replyTo: '',
  allowInsecureTls: false
})

const loading = ref(true)
const saving = ref(false)
const resetting = ref(false)
const overridden = ref(false)
// The stored password is never sent to the browser; this drives the "leave
// blank to keep" hint so an admin isn't misled by an empty field.
const passwordSet = ref(false)

const ENCRYPTION_ITEMS = [
  { value: 'starttls', label: 'STARTTLS (recommended, port 587)' },
  { value: 'ssl', label: 'Implicit TLS / SMTPS (port 465)' },
  { value: 'none', label: 'None — unencrypted (internal relay only)' }
]

// Ports and encryption travel together; nudging the port when the mode
// changes saves the most common misconfiguration (587 with implicit TLS).
const SUGGESTED_PORTS: Record<EmailSettingsForm['encryption'], number> = { starttls: 587, ssl: 465, none: 25 }
watch(() => form.encryption, (next, prev) => {
  if (prev && form.port === SUGGESTED_PORTS[prev]) form.port = SUGGESTED_PORTS[next]
})

async function loadSettings() {
  loading.value = true
  try {
    const s = await $fetch<any>('/api/settings/email')
    Object.assign(form, { ...s, password: '' })
    passwordSet.value = s.passwordSet
    overridden.value = s.overridden
  } catch (e: any) {
    toast.add({ title: 'Failed to load email settings', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    loading.value = false
  }
}

async function saveSettings() {
  saving.value = true
  try {
    const s = await $fetch<any>('/api/settings/email', { method: 'PUT', body: { ...form } })
    Object.assign(form, { ...s, password: '' })
    passwordSet.value = s.passwordSet
    overridden.value = s.overridden
    toast.add({ title: 'Email settings saved', color: 'primary', icon: 'i-lucide-check' })
  } catch (e: any) {
    toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    saving.value = false
  }
}

async function resetSettings() {
  if (!confirm('Discard the stored email settings and follow the NUXT_SMTP_* environment variables again?')) return
  resetting.value = true
  try {
    const s = await $fetch<any>('/api/settings/email', { method: 'DELETE' })
    Object.assign(form, { ...s, password: '' })
    passwordSet.value = s.passwordSet
    overridden.value = s.overridden
    toast.add({ title: 'Reverted to environment defaults', color: 'primary', icon: 'i-lucide-rotate-ccw' })
  } catch (e: any) {
    toast.add({ title: 'Reset failed', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    resetting.value = false
  }
}

// ── Send test ─────────────────────────────────────────────────────────────
const testTo = ref('')
const testing = ref(false)
const testResult = ref<{ ok: boolean; target: string; error?: string; transcript?: string[] } | null>(null)

async function sendTest() {
  if (!testTo.value.trim()) {
    toast.add({ title: 'Enter a recipient address first', color: 'warning' })
    return
  }
  testing.value = true
  testResult.value = null
  try {
    // The current (possibly unsaved) form is what gets tested.
    testResult.value = await $fetch<any>('/api/settings/email/test', {
      method: 'POST',
      body: { to: testTo.value.trim(), settings: { ...form } }
    })
    if (testResult.value?.ok) {
      toast.add({ title: 'Test email sent', description: testResult.value.target, color: 'primary', icon: 'i-lucide-mail-check' })
    } else {
      toast.add({ title: 'Test email failed', description: testResult.value?.error, color: 'error' })
    }
  } catch (e: any) {
    testResult.value = { ok: false, target: form.host, error: e?.data?.statusMessage ?? String(e) }
    toast.add({ title: 'Test email failed', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    testing.value = false
  }
}

// ── Templates ─────────────────────────────────────────────────────────────
type ResolvedTemplate = EmailTemplate & { customized: boolean }

const templates = ref<ResolvedTemplate[]>([])
const templatesLoading = ref(true)
const selectedKey = ref<string>('')
const savingTemplate = ref(false)
const resettingTemplate = ref(false)

const draft = reactive({ subject: '', format: 'markdown' as 'markdown' | 'html', body: '' })
const bodyRef = ref<any>(null)

const selected = computed(() => templates.value.find((t) => t.key === selectedKey.value) ?? null)
const availableVariables = computed<EmailTemplateVariable[]>(() =>
  selected.value ? variablesForTemplate(selected.value) : []
)
const dirty = computed(() => {
  if (!selected.value) return false
  return draft.subject !== selected.value.subject
    || draft.format !== selected.value.format
    || draft.body !== selected.value.body
})

async function loadTemplates() {
  templatesLoading.value = true
  try {
    const res = await $fetch<any>('/api/settings/email/templates')
    templates.value = res.templates
    if (!selectedKey.value && templates.value.length) selectTemplate(templates.value[0]!.key)
  } catch (e: any) {
    toast.add({ title: 'Failed to load templates', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    templatesLoading.value = false
  }
}

function selectTemplate(key: string) {
  if (dirty.value && !confirm('Discard unsaved changes to this template?')) return
  selectedKey.value = key
  const t = templates.value.find((x) => x.key === key)
  if (!t) return
  draft.subject = t.subject
  draft.format = t.format
  draft.body = t.body
  refreshPreview()
}

async function saveTemplate() {
  if (!selected.value) return
  savingTemplate.value = true
  try {
    const saved = await $fetch<ResolvedTemplate>(`/api/settings/email/templates/${selected.value.key}`, {
      method: 'PUT',
      body: { subject: draft.subject, format: draft.format, body: draft.body }
    })
    templates.value = templates.value.map((t) => (t.key === saved.key ? saved : t))
    toast.add({ title: 'Template saved', description: saved.name, color: 'primary', icon: 'i-lucide-check' })
  } catch (e: any) {
    toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    savingTemplate.value = false
  }
}

async function resetTemplate() {
  if (!selected.value) return
  if (!confirm(`Restore "${selected.value.name}" to the built-in default content?`)) return
  resettingTemplate.value = true
  try {
    const restored = await $fetch<ResolvedTemplate>(`/api/settings/email/templates/${selected.value.key}`, { method: 'DELETE' })
    templates.value = templates.value.map((t) => (t.key === restored.key ? restored : t))
    draft.subject = restored.subject
    draft.format = restored.format
    draft.body = restored.body
    refreshPreview()
    toast.add({ title: 'Template restored to default', color: 'primary', icon: 'i-lucide-rotate-ccw' })
  } catch (e: any) {
    toast.add({ title: 'Reset failed', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    resettingTemplate.value = false
  }
}

// Built by concatenation, never as a literal in this file: a bare "{{" in a
// Vue template (or an interpolation returning one) is parsed as a delimiter.
const OPEN = '{' + '{'
const CLOSE = '}' + '}'

/** The literal text of a placeholder, for the click-to-insert chips. */
function placeholder(path: string): string {
  return OPEN + path + CLOSE
}

/** Insert a placeholder at the caret (or append when unfocused). */
function insertVariable(path: string) {
  const token = placeholder(path)
  const el: HTMLTextAreaElement | undefined = bodyRef.value?.textareaRef ?? bodyRef.value?.$el?.querySelector?.('textarea')
  if (!el) {
    draft.body += token
    return
  }
  const start = el.selectionStart ?? draft.body.length
  const end = el.selectionEnd ?? start
  draft.body = draft.body.slice(0, start) + token + draft.body.slice(end)
  nextTick(() => {
    el.focus()
    el.setSelectionRange(start + token.length, start + token.length)
  })
}

// ── Preview ───────────────────────────────────────────────────────────────
const preview = ref<{ subject: string; html: string; text: string } | null>(null)
const previewMode = ref<'html' | 'text'>('html')
const previewing = ref(false)
let previewTimer: ReturnType<typeof setTimeout> | undefined

async function refreshPreview() {
  if (!selected.value) return
  previewing.value = true
  try {
    preview.value = await $fetch<any>('/api/settings/email/preview', {
      method: 'POST',
      body: { key: selected.value.key, subject: draft.subject, format: draft.format, body: draft.body }
    })
  } catch (e: any) {
    preview.value = null
    toast.add({ title: 'Preview failed', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    previewing.value = false
  }
}

// Debounced: the preview is a server round trip on every keystroke otherwise.
watch(() => [draft.subject, draft.body, draft.format], () => {
  clearTimeout(previewTimer)
  previewTimer = setTimeout(refreshPreview, 500)
})

onMounted(() => {
  loadSettings()
  loadTemplates()
})
onBeforeUnmount(() => clearTimeout(previewTimer))
</script>

<template>
  <div>
    <PageHeader
      title="Email"
      subtitle="SMTP delivery and the content of every message the portal sends"
      icon="i-lucide-mail"
    />

    <div class="mb-4 flex flex-wrap gap-1 border-b border-hull">
      <button
        v-for="[key, label, icon] in tabs"
        :key="key"
        :class="['flex items-center gap-2 px-3 py-2 text-sm', tab === key ? 'border-b-2 border-primary font-medium text-primary' : 'text-muted hover:text-default']"
        @click="tab = key"
      >
        <UIcon :name="icon" class="size-4" />
        {{ label }}
      </button>
    </div>

    <!-- ═══ General: SMTP transport ═══ -->
    <div v-if="tab === 'general'">
      <div v-if="loading" class="panel p-10 text-center text-muted">Loading…</div>

      <div v-else class="grid gap-4 xl:grid-cols-2">
        <section class="panel space-y-5 p-5">
          <header class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div class="min-w-0">
              <h3 class="font-display flex items-center gap-2 text-sm font-semibold text-foam">
                <UIcon name="i-lucide-server-cog" class="size-4 text-beacon" />
                SMTP relay
              </h3>
              <p class="mt-1 text-xs text-(--color-muted)">
                Where the portal hands off outbound mail. Credentials are encrypted at rest and never sent back to this page.
              </p>
            </div>
            <UBadge
              :color="overridden ? 'primary' : 'neutral'"
              variant="subtle"
              :label="overridden ? 'DB override' : 'Env default'"
              class="self-start"
            />
          </header>

          <UCheckbox
            v-model="form.enabled"
            label="Enable email delivery"
            description="When off, no message is sent — templates and the test button still work for verification."
          />

          <div class="grid gap-4 sm:grid-cols-3">
            <UFormField label="Host" class="sm:col-span-2">
              <UInput v-model="form.host" class="w-full" placeholder="smtp.example.com" />
            </UFormField>
            <UFormField label="Port">
              <UInput v-model.number="form.port" type="number" min="1" max="65535" class="w-full" />
            </UFormField>
          </div>

          <UFormField label="Encryption">
            <USelect v-model="form.encryption" :items="ENCRYPTION_ITEMS" value-key="value" label-key="label" class="w-full" />
          </UFormField>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Username" description="Leave blank for a relay that accepts unauthenticated mail.">
              <UInput v-model="form.username" class="w-full" placeholder="noreply@example.com" autocomplete="off" />
            </UFormField>
            <UFormField label="Password" :description="passwordSet ? 'A password is saved — leave blank to keep it.' : 'No password saved yet.'">
              <UInput
                v-model="form.password"
                type="password"
                class="w-full"
                :placeholder="passwordSet ? '••••••••' : ''"
                autocomplete="new-password"
              />
            </UFormField>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="From name" description="Display name recipients see.">
              <UInput v-model="form.fromName" class="w-full" placeholder="KNetraHub" />
            </UFormField>
            <UFormField label="From address">
              <UInput v-model="form.fromAddress" class="w-full" placeholder="noreply@example.com" />
            </UFormField>
          </div>

          <UFormField label="Reply-To" description="Optional. Blank means replies go to the From address.">
            <UInput v-model="form.replyTo" class="w-full sm:w-72" placeholder="support@example.com" />
          </UFormField>

          <UCheckbox
            v-model="form.allowInsecureTls"
            label="Accept self-signed certificates"
            description="Only for an internal relay with a private CA. Disables certificate verification."
          />

          <footer class="flex flex-col gap-2 border-t border-hull pt-4 sm:flex-row sm:justify-end">
            <UButton
              color="neutral"
              variant="ghost"
              label="Revert to environment"
              icon="i-lucide-rotate-ccw"
              :disabled="!overridden"
              :loading="resetting"
              @click="resetSettings"
            />
            <UButton color="primary" label="Save settings" icon="i-lucide-save" :loading="saving" @click="saveSettings" />
          </footer>
        </section>

        <section class="panel space-y-4 p-5">
          <header class="min-w-0">
            <h3 class="font-display flex items-center gap-2 text-sm font-semibold text-foam">
              <UIcon name="i-lucide-send" class="size-4 text-beacon" />
              Send a test message
            </h3>
            <p class="mt-1 text-xs text-(--color-muted)">
              Delivers the <strong class="text-foam">Test message</strong> template using the settings currently in the form —
              including unsaved edits — so a relay can be proven before you commit it.
            </p>
          </header>

          <UFormField label="Recipient">
            <div class="flex flex-col gap-2 sm:flex-row">
              <UInput v-model="testTo" class="w-full" placeholder="you@example.com" @keyup.enter="sendTest" />
              <UButton
                color="primary"
                variant="soft"
                label="Send test"
                icon="i-lucide-send"
                :loading="testing"
                :disabled="!form.host"
                class="shrink-0"
                @click="sendTest"
              />
            </div>
          </UFormField>

          <div v-if="testResult" :class="['rounded-lg border p-3 text-sm', testResult.ok ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5']">
            <p class="flex items-center gap-2 font-medium" :class="testResult.ok ? 'text-emerald-400' : 'text-red-400'">
              <UIcon :name="testResult.ok ? 'i-lucide-circle-check' : 'i-lucide-circle-x'" class="size-4" />
              {{ testResult.ok ? 'Delivered' : 'Delivery failed' }}
            </p>
            <p class="mt-1 break-all font-mono text-xs text-(--color-muted)">{{ testResult.target }}</p>
            <p v-if="testResult.error" class="mt-2 text-xs text-red-400">{{ testResult.error }}</p>

            <details v-if="testResult.transcript?.length" class="mt-3">
              <summary class="cursor-pointer text-xs text-(--color-muted) hover:text-foam">SMTP conversation</summary>
              <pre class="mt-2 max-h-64 overflow-auto rounded bg-ink p-3 text-[11px] leading-5 text-(--color-muted)">{{ testResult.transcript.join('\n') }}</pre>
            </details>
          </div>

          <div class="notice-info flex items-start gap-3 p-3 text-xs">
            <UIcon name="i-lucide-info" class="mt-0.5 size-4 shrink-0" />
            <div class="min-w-0 text-(--color-muted)">
              <p class="font-medium text-foam">Environment defaults</p>
              <p class="mt-1">
                These settings can also be supplied with <span class="font-mono">NUXT_SMTP_*</span> variables at deploy time.
                Saving here stores a database override that wins over the environment until reverted.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>

    <!-- ═══ Templates ═══ -->
    <div v-else>
      <div v-if="templatesLoading" class="panel p-10 text-center text-muted">Loading templates…</div>

      <div v-else class="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <!-- Template list -->
        <section class="panel h-max p-3">
          <h3 class="font-display mb-2 px-2 pt-1 text-xs font-semibold uppercase tracking-wide text-(--color-muted)">
            Messages
          </h3>
          <ul class="space-y-1">
            <li v-for="t in templates" :key="t.key">
              <button
                :class="['w-full rounded-lg px-3 py-2 text-left transition', selectedKey === t.key ? 'bg-beacon/10 text-foam ring-1 ring-beacon/30' : 'hover:bg-surface-2']"
                @click="selectTemplate(t.key)"
              >
                <span class="flex items-center gap-2">
                  <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ t.name }}</span>
                  <UBadge v-if="t.customized" color="primary" variant="subtle" size="xs" label="Custom" />
                </span>
                <span class="mt-0.5 block text-xs leading-4 text-(--color-muted)">{{ t.description }}</span>
              </button>
            </li>
          </ul>
        </section>

        <!-- Editor + preview -->
        <section v-if="selected" class="space-y-4">
          <div class="panel space-y-4 p-5">
            <header class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div class="min-w-0">
                <h3 class="font-display text-sm font-semibold text-foam">{{ selected.name }}</h3>
                <p class="mt-1 text-xs text-(--color-muted)">{{ selected.description }}</p>
              </div>
              <UBadge
                :color="selected.customized ? 'primary' : 'neutral'"
                variant="subtle"
                :label="selected.customized ? 'Customized' : 'Built-in default'"
                class="self-start shrink-0"
              />
            </header>

            <UFormField label="Subject" description="Placeholders work here too.">
              <UInput v-model="draft.subject" class="w-full font-mono text-sm" />
            </UFormField>

            <UFormField label="Format">
              <div class="flex gap-2">
                <UButton
                  :color="draft.format === 'markdown' ? 'primary' : 'neutral'"
                  :variant="draft.format === 'markdown' ? 'soft' : 'ghost'"
                  size="sm"
                  icon="i-lucide-file-text"
                  label="Markdown"
                  @click="draft.format = 'markdown'"
                />
                <UButton
                  :color="draft.format === 'html' ? 'primary' : 'neutral'"
                  :variant="draft.format === 'html' ? 'soft' : 'ghost'"
                  size="sm"
                  icon="i-lucide-code"
                  label="HTML"
                  @click="draft.format = 'html'"
                />
              </div>
              <p class="mt-2 text-xs text-(--color-muted)">
                <template v-if="draft.format === 'markdown'">
                  Headings, <strong>**bold**</strong>, <em>*italic*</em>, <code>`code`</code>, lists, quotes, rules and
                  [links](https://…) are converted to styled HTML. Raw HTML is escaped — switch to HTML format to write markup.
                </template>
                <template v-else>
                  Your markup is used verbatim inside the message wrapper. Inline your CSS — most mail clients drop
                  <span class="font-mono">&lt;style&gt;</span> blocks.
                </template>
              </p>
            </UFormField>

            <UFormField label="Message body">
              <UTextarea
                ref="bodyRef"
                v-model="draft.body"
                :rows="16"
                class="w-full font-mono text-sm"
                spellcheck="false"
              />
            </UFormField>

            <div>
              <p class="mb-2 text-xs font-medium text-foam">Available placeholders — click to insert</p>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="v in availableVariables"
                  :key="v.path"
                  type="button"
                  :title="v.description"
                  class="rounded border border-hull bg-surface-2 px-2 py-1 font-mono text-[11px] text-(--color-muted) transition hover:border-beacon/40 hover:text-foam"
                  @click="insertVariable(v.path)"
                >
                  {{ placeholder(v.path) }}
                </button>
              </div>
            </div>

            <footer class="flex flex-col gap-2 border-t border-hull pt-4 sm:flex-row sm:items-center sm:justify-end">
              <span v-if="dirty" class="mr-auto text-xs text-amber-400">Unsaved changes</span>
              <UButton
                color="neutral"
                variant="ghost"
                label="Restore default"
                icon="i-lucide-rotate-ccw"
                :disabled="!selected.customized"
                :loading="resettingTemplate"
                @click="resetTemplate"
              />
              <UButton
                color="primary"
                label="Save template"
                icon="i-lucide-save"
                :disabled="!dirty"
                :loading="savingTemplate"
                @click="saveTemplate"
              />
            </footer>
          </div>

          <!-- Preview -->
          <div class="panel p-5">
            <header class="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h3 class="font-display flex items-center gap-2 text-sm font-semibold text-foam">
                <UIcon name="i-lucide-eye" class="size-4 text-beacon" />
                Preview
                <UIcon v-if="previewing" name="i-lucide-loader-circle" class="size-3.5 animate-spin text-(--color-muted)" />
              </h3>
              <div class="flex gap-1">
                <UButton
                  v-for="mode in (['html', 'text'] as const)"
                  :key="mode"
                  :color="previewMode === mode ? 'primary' : 'neutral'"
                  :variant="previewMode === mode ? 'soft' : 'ghost'"
                  size="xs"
                  :label="mode === 'html' ? 'HTML' : 'Plain text'"
                  @click="previewMode = mode"
                />
              </div>
            </header>

            <p class="mb-3 text-xs text-(--color-muted)">
              Rendered with sample data through the same code path as a real send.
            </p>

            <div v-if="preview" class="overflow-hidden rounded-lg border border-hull">
              <div class="border-b border-hull-soft bg-ink px-4 py-2.5">
                <p class="text-[11px] uppercase tracking-wide text-(--color-muted)">Subject</p>
                <p class="mt-0.5 truncate text-sm font-medium text-foam">{{ preview.subject }}</p>
              </div>
              <!-- Sandboxed: the preview must never run script or navigate the console. -->
              <iframe
                v-if="previewMode === 'html'"
                :srcdoc="preview.html"
                sandbox=""
                title="Email preview"
                class="h-[28rem] w-full bg-white"
              />
              <pre v-else class="h-[28rem] overflow-auto whitespace-pre-wrap bg-surface p-4 text-xs leading-5 text-(--color-muted)">{{ preview.text }}</pre>
            </div>
            <div v-else class="rounded-lg border border-dashed border-hull p-10 text-center text-sm text-muted">
              No preview yet.
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
