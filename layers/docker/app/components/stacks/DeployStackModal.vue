<script setup lang="ts">
import type { ServiceModel, NetworkModel, VolumeModel, ConfigModel, SecretModel } from '~~/layers/docker/app/composables/useComposeBuilder'

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ deployed: [] }>()
const toast = useToast()
const { data: gl } = useFetch('/api/gitlab/status', { lazy: true })

const { emptyModel, newService, newNetwork, newVolume, newConfig, newSecret, parseComposeToModel, modelToYaml } = useComposeBuilder()

const mode = ref<'form' | 'yaml'>('form')
const stackName = ref('')
const commitMessage = ref('')
const model = ref(emptyModel())
const yamlText = ref('')
const deploying = ref(false)
const validating = ref(false)

// ── Version tracking: local DB history is the always-available default;
// GitLab becomes selectable once the integration is configured. ────────────
type TrackOption = 'local' | 'gitlab' | 'both' | 'none'
const track = ref<TrackOption>('local')
const trackItems = computed(() => [
  ...(gl.value?.enabled
    ? [
        { label: 'Local + GitLab (recommended)', value: 'both' },
        { label: 'Local history only', value: 'local' },
        { label: 'GitLab only', value: 'gitlab' }
      ]
    : [{ label: 'Local history (default)', value: 'local' }]),
  { label: 'No versioning', value: 'none' }
])
const messageLabel = computed(() => track.value === 'gitlab' || track.value === 'both' ? 'Commit message' : 'Version message')

interface ValidationResult { valid: boolean; errors: string[]; warnings: string[]; needsSecrets: { key: string; fullName: string }[]; needsConfigs: { key: string; fullName: string }[] }
const lastValidation = ref<ValidationResult | null>(null)

// ── Form <-> YAML live sync ("last edited wins") ────────────────────────────
let syncing = false
watch(model, () => {
  if (syncing) return
  syncing = true
  yamlText.value = modelToYaml(model.value)
  syncing = false
}, { deep: true })

watch(yamlText, (text) => {
  if (syncing) return
  const parsed = parseComposeToModel(text, model.value)
  if (!parsed) return // invalid YAML mid-edit - keep the last good model, don't clobber it
  syncing = true
  model.value = parsed
  syncing = false
})

// ── Reset whenever the modal opens ──────────────────────────────────────────
watch(open, (isOpen) => {
  if (!isOpen) return
  mode.value = 'form'
  stackName.value = ''
  commitMessage.value = ''
  track.value = gl.value?.enabled ? 'both' : 'local'
  model.value = emptyModel()
  syncing = true
  yamlText.value = modelToYaml(model.value)
  syncing = false
  activeNav.value = `service:${model.value.services[0]!.id}`
  lastValidation.value = null
  secretsPopupOpen.value = false
  for (const k of Object.keys(secretsForm)) delete secretsForm[k]
  for (const k of Object.keys(configsForm)) delete configsForm[k]
})

// ── Left nav: one entry per service + the 4 stack-level sections ───────────
// Keyed by the service's stable `id`, not its (editable) name - otherwise
// renaming a service mid-edit would desync activeNav from the service list
// and blank out the panel.
const navItems = computed(() => [
  ...model.value.services.map((s) => ({ key: `service:${s.id}`, label: s.key || '(unnamed)', icon: 'i-lucide-box' })),
  { key: 'networks', label: `Networks (${model.value.networks.length})`, icon: 'i-lucide-network' },
  { key: 'volumes', label: `Volumes (${model.value.volumes.length})`, icon: 'i-lucide-database' },
  { key: 'configs', label: `Configs (${model.value.configs.length})`, icon: 'i-lucide-file-cog' },
  { key: 'secrets', label: `Secrets (${model.value.secrets.length})`, icon: 'i-lucide-key-round' }
])
const activeNav = ref(`service:${model.value.services[0]!.id}`)
const activeService = computed<ServiceModel | null>(() => {
  if (!activeNav.value.startsWith('service:')) return null
  const id = activeNav.value.slice('service:'.length)
  return model.value.services.find((s) => s.id === id) || null
})

function dupSet(keys: string[]) {
  const seen = new Set<string>(); const dup = new Set<string>()
  for (const k of keys) { if (!k) continue; if (seen.has(k)) dup.add(k); seen.add(k) }
  return dup
}
const dupServiceKeys = computed(() => dupSet(model.value.services.map((s) => s.key)))
const dupNetworkKeys = computed(() => dupSet(model.value.networks.map((n) => n.key)))
const dupVolumeKeys = computed(() => dupSet(model.value.volumes.map((v) => v.key)))
const dupConfigKeys = computed(() => dupSet(model.value.configs.map((c) => c.key)))
const dupSecretKeys = computed(() => dupSet(model.value.secrets.map((s) => s.key)))
const hasDuplicateKeys = computed(() =>
  dupServiceKeys.value.size > 0 || dupNetworkKeys.value.size > 0 || dupVolumeKeys.value.size > 0 || dupConfigKeys.value.size > 0 || dupSecretKeys.value.size > 0
)

function uniqueKey(existing: string[], base: string) {
  if (!existing.includes(base)) return base
  let n = 2
  while (existing.includes(`${base}${n}`)) n++
  return `${base}${n}`
}
function addService() {
  const key = uniqueKey(model.value.services.map((s) => s.key), 'service')
  const created = newService(key)
  model.value.services.push(created)
  activeNav.value = `service:${created.id}`
}
function removeService(i: number) {
  const id = model.value.services[i]!.id
  model.value.services.splice(i, 1)
  if (activeNav.value === `service:${id}`) activeNav.value = navItems.value[0]?.key || 'networks'
}
function addNetwork() { model.value.networks.push(newNetwork(uniqueKey(model.value.networks.map((n) => n.key), 'network'))) }
function addVolume() { model.value.volumes.push(newVolume(uniqueKey(model.value.volumes.map((v) => v.key), 'volume'))) }
function addConfig() { model.value.configs.push(newConfig(uniqueKey(model.value.configs.map((c) => c.key), 'config'))) }
function addSecret() { model.value.secrets.push(newSecret(uniqueKey(model.value.secrets.map((s) => s.key), 'secret'))) }

const networkOptions = computed(() => model.value.networks.map((n) => ({ label: n.key, value: n.key })))
const configOptions = computed(() => model.value.configs.map((c) => ({ label: c.key, value: c.key })))
const secretOptions = computed(() => model.value.secrets.map((s) => ({ label: s.key, value: s.key })))
const protocolItems = ['tcp', 'udp']
const portModeItems = ['ingress', 'host']
const restartConditionItems = ['any', 'on-failure', 'none']
const mountTypeItems = ['volume', 'bind']

function addPort(svc: ServiceModel) { svc.ports.push({ published: '', target: '', protocol: 'tcp', mode: 'ingress' }) }
function addEnv(svc: ServiceModel) { svc.environment.push({ key: '', value: '' }) }
function addMount(svc: ServiceModel) { svc.volumes.push({ type: 'volume', source: '', target: '', readOnly: false }) }
function addServiceConfig(svc: ServiceModel) { svc.configs.push({ source: configOptions.value[0]?.value || '', target: '', uid: '', gid: '', mode: '' }) }
function addServiceSecret(svc: ServiceModel) { svc.secrets.push({ source: secretOptions.value[0]?.value || '', target: '', uid: '', gid: '', mode: '' }) }
function addLabel(svc: ServiceModel) { svc.labels.push({ key: '', value: '' }) }
function addServiceLabel(svc: ServiceModel) { svc.serviceLabels.push({ key: '', value: '' }) }
function addConstraint(svc: ServiceModel) { svc.placementConstraints.push('') }

// ── Validation (debounced, and re-run once more right before deploy) ───────
let validateTimer: ReturnType<typeof setTimeout> | null = null
function scheduleValidate() {
  if (validateTimer) clearTimeout(validateTimer)
  validateTimer = setTimeout(runValidate, 600)
}
async function runValidate() {
  if (!stackName.value.trim() || !yamlText.value.trim()) { lastValidation.value = null; return }
  validating.value = true
  try {
    lastValidation.value = await $fetch<ValidationResult>('/api/stacks/validate', { method: 'POST', body: { name: stackName.value, compose: yamlText.value } })
  } catch (e: any) {
    lastValidation.value = { valid: false, errors: [e?.data?.statusMessage || e?.message || 'Validation failed'], warnings: [], needsSecrets: [], needsConfigs: [] }
  } finally {
    validating.value = false
  }
}
watch([stackName, yamlText], scheduleValidate)

// ── Deploy, with a popup for any non-external secret/config that still
// needs its content collected before Docker can create it. ─────────────────
const secretsPopupOpen = ref(false)
const secretsForm = reactive<Record<string, string>>({})
const configsForm = reactive<Record<string, string>>({})

async function attemptDeploy() {
  if (!stackName.value.trim()) { toast.add({ title: 'Stack name is required', color: 'warning' }); return }
  if (hasDuplicateKeys.value) { toast.add({ title: 'Fix duplicate names before deploying', color: 'error' }); return }
  if (validateTimer) clearTimeout(validateTimer)
  await runValidate()
  if (!lastValidation.value?.valid) {
    toast.add({ title: 'Fix validation errors before deploying', color: 'error' })
    return
  }

  const needs = lastValidation.value
  if (needs.needsSecrets.length || needs.needsConfigs.length) {
    for (const s of needs.needsSecrets) if (secretsForm[s.key] === undefined) secretsForm[s.key] = ''
    for (const c of needs.needsConfigs) if (configsForm[c.key] === undefined) configsForm[c.key] = ''
    secretsPopupOpen.value = true
    return
  }
  await doDeploy()
}

async function confirmSecretsAndDeploy() {
  secretsPopupOpen.value = false
  await doDeploy()
}

async function doDeploy() {
  deploying.value = true
  try {
    const res: any = await $fetch('/api/stacks', {
      method: 'POST',
      body: {
        name: stackName.value,
        compose: yamlText.value,
        message: commitMessage.value,
        track: track.value,
        secretsContent: { ...secretsForm },
        configsContent: { ...configsForm }
      }
    })
    const parts = [`${res.created?.length || 0} created`, `${res.updated?.length || 0} updated`]
    if (res.removed?.length) parts.push(`${res.removed.length} removed`)
    toast.add({ title: `Deployed ${stackName.value}`, description: parts.join(', '), color: 'primary', icon: 'i-lucide-rocket' })
    if (res.warnings?.length) toast.add({ title: 'Deployed with warnings', description: res.warnings.slice(0, 3).join('; '), color: 'warning' })
    open.value = false
    emit('deployed')
  } catch (e: any) {
    toast.add({ title: 'Deploy failed', description: e?.data?.statusMessage || e?.message, color: 'error' })
  } finally {
    deploying.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Deploy stack"
    description="Build it as a form, or write the compose file directly - either view stays in sync with the other."
    :ui="{ content: 'w-[95vw] max-w-[1600px] h-[88vh] max-h-[88vh] sm:max-h-[88vh]' }"
  >
    <template #body>
      <div class="flex h-full min-h-0 flex-col gap-4">
        <div class="grid shrink-0 gap-3 sm:grid-cols-3">
          <UFormField label="Stack name" required>
            <UInput v-model="stackName" placeholder="my-app" icon="i-lucide-layers" class="w-full font-mono" :disabled="deploying" />
          </UFormField>
          <UFormField label="History tracking" :hint="gl?.enabled ? undefined : 'Configure GitLab in Dock settings to also version in Git'">
            <USelect v-model="track" :items="trackItems" value-key="value" label-key="label" icon="i-lucide-history" class="w-full" :disabled="deploying" />
          </UFormField>
          <UFormField v-if="track !== 'none'" :label="messageLabel">
            <UInput v-model="commitMessage" placeholder="Deploy my-app via KNetraHub" class="w-full" :disabled="deploying" />
          </UFormField>
        </div>

        <div v-if="lastValidation && (lastValidation.errors.length || lastValidation.warnings.length)" class="shrink-0 space-y-1.5">
          <div v-for="(e, i) in lastValidation.errors" :key="`e${i}`" class="notice-danger panel-flush flex items-start gap-2 p-2.5 text-xs">
            <UIcon name="i-lucide-circle-x" class="size-3.5 mt-0.5 shrink-0" />{{ e }}
          </div>
          <div v-for="(w, i) in lastValidation.warnings" :key="`w${i}`" class="notice-warning panel-flush flex items-start gap-2 p-2.5 text-xs">
            <UIcon name="i-lucide-triangle-alert" class="size-3.5 mt-0.5 shrink-0" />{{ w }}
          </div>
        </div>

        <!-- Form / YAML switch -->
        <div class="inline-flex shrink-0 rounded-lg bg-surface-2 p-1 text-sm">
          <button type="button" class="rounded-md px-3 py-1.5 font-medium transition" :class="mode === 'form' ? 'bg-beacon/15 text-beacon' : 'text-faint hover:text-foam'" @click="mode = 'form'">Form</button>
          <button type="button" class="rounded-md px-3 py-1.5 font-medium transition" :class="mode === 'yaml' ? 'bg-beacon/15 text-beacon' : 'text-faint hover:text-foam'" @click="mode = 'yaml'">Configuration file</button>
        </div>

        <!-- ── Form / Configuration file — fills all remaining height so the
             dialog itself never resizes when switching tabs; each pane owns
             its own internal scrolling instead. ───────────────────────────── -->
        <div class="min-h-0 flex-1">
        <Transition name="tab-fade" mode="out-in">
        <!-- ── Form ─────────────────────────────────────────────────────── -->
        <div v-if="mode === 'form'" key="form" class="flex h-full min-h-0 flex-col gap-4 sm:flex-row">
          <nav class="flex shrink-0 gap-1.5 overflow-x-auto pb-1 sm:w-52 sm:flex-col sm:gap-1 sm:overflow-visible sm:border-r sm:border-hull sm:pr-4 sm:pb-0">
            <button
              v-for="t in navItems" :key="t.key" type="button"
              class="flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition sm:w-full"
              :class="activeNav === t.key ? 'bg-beacon/12 text-beacon' : 'text-faint hover:bg-surface-2 hover:text-foam'"
              @click="activeNav = t.key"
            >
              <UIcon :name="t.icon" class="size-4 shrink-0" />
              <span class="truncate font-mono">{{ t.label }}</span>
            </button>
            <UButton icon="i-lucide-plus" color="neutral" variant="soft" size="xs" label="Add service" class="mt-1 shrink-0" :disabled="deploying" @click="addService" />
          </nav>

          <div class="min-h-0 min-w-0 flex-1">
            <Transition name="tab-fade" mode="out-in">
            <div :key="activeNav" class="h-full space-y-3 overflow-y-auto pr-1">
              <!-- SERVICE -->
              <template v-if="activeService">
                <div class="field-card">
                  <div class="field-card-header">
                    <p class="field-card-title">Basics</p>
                    <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="sm" label="Remove service" :disabled="deploying" @click="removeService(model.services.indexOf(activeService))" />
                  </div>
                  <div class="grid gap-3 sm:grid-cols-2">
                    <UFormField label="Name" required :error="dupServiceKeys.has(activeService.key) ? 'Duplicate service name' : undefined">
                      <UInput v-model="activeService.key" class="w-full font-mono" :disabled="deploying" />
                    </UFormField>
                    <UFormField label="Image" required>
                      <div class="flex w-full items-center gap-1.5">
                        <UInput v-model="activeService.image" placeholder="nginx:alpine" class="w-full font-mono" :disabled="deploying" />
                        <StacksImageSearchPopover :disabled="deploying" @select="activeService.image = $event" />
                      </div>
                    </UFormField>
                    <UFormField label="Command"><UInput v-model="activeService.command" class="w-full font-mono" :disabled="deploying" /></UFormField>
                    <UFormField label="Args"><UInput v-model="activeService.args" class="w-full font-mono" :disabled="deploying" /></UFormField>
                    <UFormField label="Hostname"><UInput v-model="activeService.hostname" class="w-full font-mono" :disabled="deploying" /></UFormField>
                    <UFormField label="Working dir"><UInput v-model="activeService.workingDir" class="w-full font-mono" :disabled="deploying" /></UFormField>
                    <UFormField label="User"><UInput v-model="activeService.user" class="w-full font-mono" :disabled="deploying" /></UFormField>
                  </div>
                </div>

                <div class="field-card">
                  <p class="field-card-title">Mode &amp; scale</p>
                  <div class="flex flex-wrap items-end gap-4">
                    <UFormField label="Mode"><USelect v-model="activeService.mode" :items="['replicated', 'global']" class="w-40" :disabled="deploying" /></UFormField>
                    <UFormField v-if="activeService.mode === 'replicated'" label="Replicas">
                      <UInput v-model.number="activeService.replicas" type="number" min="0" class="w-32" :disabled="deploying" />
                    </UFormField>
                  </div>
                </div>

                <div class="field-card">
                  <div class="field-card-header">
                    <p class="field-card-title">Ports</p>
                    <UButton icon="i-lucide-plus" color="neutral" variant="soft" size="xs" label="Add port" :disabled="deploying" @click="addPort(activeService)" />
                  </div>
                  <p v-if="!activeService.ports.length" class="field-card-empty">No published ports.</p>
                  <div class="space-y-2">
                    <div v-for="(row, i) in activeService.ports" :key="i" class="flex items-center gap-2">
                      <UInput v-model="row.target" placeholder="container" class="w-1/4 font-mono" :disabled="deploying" />
                      <UInput v-model="row.published" placeholder="host" class="w-1/4 font-mono" :disabled="deploying" />
                      <USelect v-model="row.protocol" :items="protocolItems" class="w-1/4" :disabled="deploying" />
                      <USelect v-model="row.mode" :items="portModeItems" class="w-1/4" :disabled="deploying" />
                      <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="sm" :disabled="deploying" @click="activeService.ports.splice(i, 1)" />
                    </div>
                  </div>
                </div>

                <div class="field-card">
                  <div class="field-card-header">
                    <p class="field-card-title">Environment</p>
                    <UButton icon="i-lucide-plus" color="neutral" variant="soft" size="xs" label="Add variable" :disabled="deploying" @click="addEnv(activeService)" />
                  </div>
                  <p v-if="!activeService.environment.length" class="field-card-empty">No environment variables.</p>
                  <div class="space-y-2">
                    <div v-for="(row, i) in activeService.environment" :key="i" class="flex items-center gap-2">
                      <UInput v-model="row.key" placeholder="KEY" class="w-2/5 font-mono" :disabled="deploying" />
                      <UInput v-model="row.value" placeholder="value" class="w-full font-mono" :disabled="deploying" />
                      <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="sm" :disabled="deploying" @click="activeService.environment.splice(i, 1)" />
                    </div>
                  </div>
                </div>

                <div class="field-card">
                  <div class="field-card-header">
                    <p class="field-card-title">Volumes / mounts</p>
                    <UButton icon="i-lucide-plus" color="neutral" variant="soft" size="xs" label="Add mount" :disabled="deploying" @click="addMount(activeService)" />
                  </div>
                  <p v-if="!activeService.volumes.length" class="field-card-empty">No mounts.</p>
                  <div class="space-y-2">
                    <div v-for="(row, i) in activeService.volumes" :key="i" class="flex items-center gap-2">
                      <USelect v-model="row.type" :items="mountTypeItems" class="w-28" :disabled="deploying" />
                      <UInput v-model="row.source" :placeholder="row.type === 'bind' ? '/host/path' : 'volume name'" class="w-1/3 font-mono" :disabled="deploying" />
                      <UInput v-model="row.target" placeholder="/container/path" class="w-full font-mono" :disabled="deploying" />
                      <UCheckbox v-model="row.readOnly" label="RO" :disabled="deploying" />
                      <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="sm" :disabled="deploying" @click="activeService.volumes.splice(i, 1)" />
                    </div>
                  </div>
                </div>

                <div class="field-card">
                  <p class="field-card-title">Networks</p>
                  <USelectMenu v-model="activeService.networks" :items="networkOptions" value-key="value" label-key="label" multiple placeholder="Attach to network" class="w-full" :disabled="deploying" />
                  <p v-if="!networkOptions.length" class="field-card-empty mt-2">Define a network in the Networks section first.</p>
                </div>

                <div class="field-card">
                  <div class="field-card-header">
                    <p class="field-card-title">Configs</p>
                    <UButton icon="i-lucide-plus" color="neutral" variant="soft" size="xs" label="Add config" :disabled="deploying || !configOptions.length" @click="addServiceConfig(activeService)" />
                  </div>
                  <p v-if="!configOptions.length" class="field-card-empty">Define a config in the Configs section first.</p>
                  <p v-else-if="!activeService.configs.length" class="field-card-empty">No configs attached.</p>
                  <div class="space-y-2">
                    <div v-for="(row, i) in activeService.configs" :key="i" class="flex items-center gap-2">
                      <USelect v-model="row.source" :items="configOptions" value-key="value" label-key="label" class="w-1/3" :disabled="deploying" />
                      <UInput v-model="row.target" placeholder="/target/path" class="w-full font-mono" :disabled="deploying" />
                      <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="sm" :disabled="deploying" @click="activeService.configs.splice(i, 1)" />
                    </div>
                  </div>
                </div>

                <div class="field-card">
                  <div class="field-card-header">
                    <p class="field-card-title">Secrets</p>
                    <UButton icon="i-lucide-plus" color="neutral" variant="soft" size="xs" label="Add secret" :disabled="deploying || !secretOptions.length" @click="addServiceSecret(activeService)" />
                  </div>
                  <p v-if="!secretOptions.length" class="field-card-empty">Define a secret in the Secrets section first.</p>
                  <p v-else-if="!activeService.secrets.length" class="field-card-empty">No secrets attached.</p>
                  <div class="space-y-2">
                    <div v-for="(row, i) in activeService.secrets" :key="i" class="flex items-center gap-2">
                      <USelect v-model="row.source" :items="secretOptions" value-key="value" label-key="label" class="w-1/3" :disabled="deploying" />
                      <UInput v-model="row.target" placeholder="/target/path" class="w-full font-mono" :disabled="deploying" />
                      <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="sm" :disabled="deploying" @click="activeService.secrets.splice(i, 1)" />
                    </div>
                  </div>
                </div>

                <div class="grid gap-4 sm:grid-cols-2">
                  <div class="field-card">
                    <p class="field-card-title">Resources</p>
                    <p class="mb-3 text-xs text-faint">Blank = unlimited.</p>
                    <div class="grid grid-cols-2 gap-3">
                      <UFormField label="Reservation CPU"><UInput v-model="activeService.reservationCpus" placeholder="0.5" class="w-full font-mono" :disabled="deploying" /></UFormField>
                      <UFormField label="Reservation memory"><UInput v-model="activeService.reservationMemory" placeholder="256M" class="w-full font-mono" :disabled="deploying" /></UFormField>
                      <UFormField label="Limit CPU"><UInput v-model="activeService.limitCpus" placeholder="1" class="w-full font-mono" :disabled="deploying" /></UFormField>
                      <UFormField label="Limit memory"><UInput v-model="activeService.limitMemory" placeholder="512M" class="w-full font-mono" :disabled="deploying" /></UFormField>
                    </div>
                  </div>
                  <div class="field-card">
                    <p class="field-card-title">Restart policy</p>
                    <div class="grid grid-cols-2 gap-3">
                      <UFormField label="Condition"><USelect v-model="activeService.restartCondition" :items="restartConditionItems" class="w-full" :disabled="deploying" /></UFormField>
                      <UFormField label="Max attempts"><UInput v-model="activeService.restartMaxAttempts" class="w-full font-mono" :disabled="deploying" /></UFormField>
                      <UFormField label="Delay"><UInput v-model="activeService.restartDelay" placeholder="5s" class="w-full font-mono" :disabled="deploying" /></UFormField>
                      <UFormField label="Window"><UInput v-model="activeService.restartWindow" placeholder="120s" class="w-full font-mono" :disabled="deploying" /></UFormField>
                    </div>
                  </div>
                </div>

                <div class="field-card">
                  <div class="field-card-header">
                    <p class="field-card-title">Placement constraints</p>
                    <UButton icon="i-lucide-plus" color="neutral" variant="soft" size="xs" label="Add constraint" :disabled="deploying" @click="addConstraint(activeService)" />
                  </div>
                  <p v-if="!activeService.placementConstraints.length" class="field-card-empty">No placement constraints.</p>
                  <div class="space-y-2">
                    <div v-for="(_, i) in activeService.placementConstraints" :key="i" class="flex items-center gap-2">
                      <UInput v-model="activeService.placementConstraints[i]" placeholder="node.role==worker" class="w-full font-mono" :disabled="deploying" />
                      <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="sm" :disabled="deploying" @click="activeService.placementConstraints.splice(i, 1)" />
                    </div>
                  </div>
                </div>

                <div class="field-card">
                  <p class="field-card-title">Healthcheck</p>
                  <div class="grid gap-3 sm:grid-cols-2">
                    <UFormField label="Test command" class="sm:col-span-2"><UInput v-model="activeService.healthcheckTest" placeholder="curl -f http://localhost/health || exit 1" class="w-full font-mono" :disabled="deploying" /></UFormField>
                    <UFormField label="Interval"><UInput v-model="activeService.healthcheckInterval" placeholder="30s" class="w-full font-mono" :disabled="deploying" /></UFormField>
                    <UFormField label="Timeout"><UInput v-model="activeService.healthcheckTimeout" placeholder="5s" class="w-full font-mono" :disabled="deploying" /></UFormField>
                    <UFormField label="Retries"><UInput v-model="activeService.healthcheckRetries" class="w-full font-mono" :disabled="deploying" /></UFormField>
                    <UFormField label="Start period"><UInput v-model="activeService.healthcheckStartPeriod" placeholder="0s" class="w-full font-mono" :disabled="deploying" /></UFormField>
                  </div>
                </div>

                <div class="grid gap-4 sm:grid-cols-2">
                  <div class="field-card">
                    <div class="field-card-header">
                      <p class="field-card-title">Container labels</p>
                      <UButton icon="i-lucide-plus" color="neutral" variant="soft" size="xs" label="Add" :disabled="deploying" @click="addLabel(activeService)" />
                    </div>
                    <p v-if="!activeService.labels.length" class="field-card-empty">No labels.</p>
                    <div class="space-y-2">
                      <div v-for="(row, i) in activeService.labels" :key="i" class="flex items-center gap-2">
                        <UInput v-model="row.key" placeholder="key" class="w-2/5 font-mono" :disabled="deploying" />
                        <UInput v-model="row.value" placeholder="value" class="w-full font-mono" :disabled="deploying" />
                        <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="sm" :disabled="deploying" @click="activeService.labels.splice(i, 1)" />
                      </div>
                    </div>
                  </div>
                  <div class="field-card">
                    <div class="field-card-header">
                      <p class="field-card-title">Service labels</p>
                      <UButton icon="i-lucide-plus" color="neutral" variant="soft" size="xs" label="Add" :disabled="deploying" @click="addServiceLabel(activeService)" />
                    </div>
                    <p v-if="!activeService.serviceLabels.length" class="field-card-empty">No labels.</p>
                    <div class="space-y-2">
                      <div v-for="(row, i) in activeService.serviceLabels" :key="i" class="flex items-center gap-2">
                        <UInput v-model="row.key" placeholder="key" class="w-2/5 font-mono" :disabled="deploying" />
                        <UInput v-model="row.value" placeholder="value" class="w-full font-mono" :disabled="deploying" />
                        <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="sm" :disabled="deploying" @click="activeService.serviceLabels.splice(i, 1)" />
                      </div>
                    </div>
                  </div>
                </div>
              </template>

              <!-- NETWORKS -->
              <template v-else-if="activeNav === 'networks'">
                <div class="field-card">
                  <div class="field-card-header">
                    <p class="field-card-title">Networks</p>
                    <UButton icon="i-lucide-plus" color="neutral" variant="soft" size="xs" label="Add network" :disabled="deploying" @click="addNetwork" />
                  </div>
                  <p v-if="!model.networks.length" class="field-card-empty">No networks defined.</p>
                  <div class="space-y-3">
                    <div v-for="(n, i) in model.networks" :key="i" class="rounded-lg border border-hull-soft p-3">
                      <div class="flex flex-wrap items-center gap-2">
                        <UInput v-model="n.key" placeholder="name" class="w-40 font-mono" :error="dupNetworkKeys.has(n.key)" :disabled="deploying" />
                        <UCheckbox v-model="n.external" label="External" :disabled="deploying" />
                        <UInput v-if="n.external" v-model="n.externalName" placeholder="existing network name" class="w-56 font-mono" :disabled="deploying" />
                        <template v-else>
                          <UInput v-model="n.driver" placeholder="overlay" class="w-32 font-mono" :disabled="deploying" />
                          <UCheckbox v-model="n.attachable" label="Attachable" :disabled="deploying" />
                        </template>
                        <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="sm" class="ml-auto" :disabled="deploying" @click="model.networks.splice(i, 1)" />
                      </div>
                    </div>
                  </div>
                </div>
              </template>

              <!-- VOLUMES -->
              <template v-else-if="activeNav === 'volumes'">
                <div class="field-card">
                  <div class="field-card-header">
                    <p class="field-card-title">Volumes</p>
                    <UButton icon="i-lucide-plus" color="neutral" variant="soft" size="xs" label="Add volume" :disabled="deploying" @click="addVolume" />
                  </div>
                  <p v-if="!model.volumes.length" class="field-card-empty">No volumes defined.</p>
                  <div class="space-y-3">
                    <div v-for="(v, i) in model.volumes" :key="i" class="rounded-lg border border-hull-soft p-3">
                      <div class="flex flex-wrap items-center gap-2">
                        <UInput v-model="v.key" placeholder="name" class="w-40 font-mono" :error="dupVolumeKeys.has(v.key)" :disabled="deploying" />
                        <UCheckbox v-model="v.external" label="External" :disabled="deploying" />
                        <UInput v-if="v.external" v-model="v.externalName" placeholder="existing volume name" class="w-56 font-mono" :disabled="deploying" />
                        <UInput v-else v-model="v.driver" placeholder="driver (default local)" class="w-56 font-mono" :disabled="deploying" />
                        <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="sm" class="ml-auto" :disabled="deploying" @click="model.volumes.splice(i, 1)" />
                      </div>
                    </div>
                  </div>
                </div>
              </template>

              <!-- CONFIGS -->
              <template v-else-if="activeNav === 'configs'">
                <div class="field-card">
                  <div class="field-card-header">
                    <p class="field-card-title">Configs</p>
                    <UButton icon="i-lucide-plus" color="neutral" variant="soft" size="xs" label="Add config" :disabled="deploying" @click="addConfig" />
                  </div>
                  <p class="field-card-empty">Non-external configs are created automatically at deploy time - you'll be prompted for their content just before deploying.</p>
                  <div class="space-y-3">
                    <div v-for="(c, i) in model.configs" :key="i" class="rounded-lg border border-hull-soft p-3">
                      <div class="flex flex-wrap items-center gap-2">
                        <UInput v-model="c.key" placeholder="name" class="w-40 font-mono" :error="dupConfigKeys.has(c.key)" :disabled="deploying" />
                        <UCheckbox v-model="c.external" label="External" :disabled="deploying" />
                        <UInput v-if="c.external" v-model="c.externalName" placeholder="existing config name" class="w-56 font-mono" :disabled="deploying" />
                        <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="sm" class="ml-auto" :disabled="deploying" @click="model.configs.splice(i, 1)" />
                      </div>
                    </div>
                  </div>
                </div>
              </template>

              <!-- SECRETS -->
              <template v-else-if="activeNav === 'secrets'">
                <div class="field-card">
                  <div class="field-card-header">
                    <p class="field-card-title">Secrets</p>
                    <UButton icon="i-lucide-plus" color="neutral" variant="soft" size="xs" label="Add secret" :disabled="deploying" @click="addSecret" />
                  </div>
                  <p class="field-card-empty">Non-external secrets are created automatically at deploy time - you'll be prompted for their content just before deploying.</p>
                  <div class="space-y-3">
                    <div v-for="(s, i) in model.secrets" :key="i" class="rounded-lg border border-hull-soft p-3">
                      <div class="flex flex-wrap items-center gap-2">
                        <UInput v-model="s.key" placeholder="name" class="w-40 font-mono" :error="dupSecretKeys.has(s.key)" :disabled="deploying" />
                        <UCheckbox v-model="s.external" label="External" :disabled="deploying" />
                        <UInput v-if="s.external" v-model="s.externalName" placeholder="existing secret name" class="w-56 font-mono" :disabled="deploying" />
                        <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="sm" class="ml-auto" :disabled="deploying" @click="model.secrets.splice(i, 1)" />
                      </div>
                    </div>
                  </div>
                </div>
              </template>
            </div>
            </Transition>
          </div>
        </div>

        <!-- ── Configuration file ───────────────────────────────────────── -->
        <div v-else key="yaml" class="h-full">
          <UTextarea v-model="yamlText" class="h-full w-full font-mono text-xs" :ui="{ base: 'h-full resize-none' }" spellcheck="false" :disabled="deploying" />
        </div>
        </Transition>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full items-center justify-between gap-2">
        <span class="text-xs text-faint">
          <UIcon v-if="validating" name="i-lucide-loader-2" class="size-3.5 animate-spin" />
          <template v-else-if="lastValidation?.valid">Validated</template>
        </span>
        <div class="flex gap-2">
          <UButton color="neutral" variant="ghost" label="Cancel" :disabled="deploying" @click="open = false" />
          <UButton color="primary" label="Deploy" icon="i-lucide-rocket" :loading="deploying" @click="attemptDeploy" />
        </div>
      </div>
    </template>
  </UModal>

  <!-- Popup: collect content for any non-external secret/config Docker doesn't already have -->
  <UModal v-model:open="secretsPopupOpen" title="Create secrets &amp; configs" description="These are declared in the compose file but don't exist in Docker yet - provide their content so they can be created before the stack deploys.">
    <template #body>
      <div class="space-y-4">
        <div v-for="s in lastValidation?.needsSecrets || []" :key="`s:${s.key}`">
          <UFormField :label="`Secret: ${s.key}`" :hint="s.fullName">
            <UTextarea v-model="secretsForm[s.key]" :rows="4" class="w-full font-mono text-xs" spellcheck="false" />
          </UFormField>
        </div>
        <div v-for="c in lastValidation?.needsConfigs || []" :key="`c:${c.key}`">
          <UFormField :label="`Config: ${c.key}`" :hint="c.fullName">
            <UTextarea v-model="configsForm[c.key]" :rows="4" class="w-full font-mono text-xs" spellcheck="false" />
          </UFormField>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton color="neutral" variant="ghost" label="Back" @click="secretsPopupOpen = false" />
        <UButton color="primary" label="Create &amp; deploy" icon="i-lucide-rocket" :loading="deploying" @click="confirmSecretsAndDeploy" />
      </div>
    </template>
  </UModal>
</template>

<style scoped>
.field-card {
  border: 1px solid var(--color-hull-soft);
  background: color-mix(in srgb, var(--color-surface-2) 55%, transparent);
  border-radius: 0.75rem;
  padding: 1rem;
}
.field-card-title {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-foam);
  margin-bottom: 0.5rem;
}
.field-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}
.field-card-header .field-card-title {
  margin-bottom: 0;
}
.field-card-empty {
  font-size: 0.75rem;
  color: var(--color-faint);
  margin-bottom: 0.5rem;
}

/* Crossfade when switching Form/YAML or between sidebar sections - keeps the
   dialog feeling alive without the layout ever jumping (height is fixed by
   the flex ancestor, not by this transition). */
.tab-fade-enter-active,
.tab-fade-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}
.tab-fade-enter-from,
.tab-fade-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
@media (prefers-reduced-motion: reduce) {
  .tab-fade-enter-active,
  .tab-fade-leave-active {
    transition: none;
  }
  .tab-fade-enter-from,
  .tab-fade-leave-to {
    transform: none;
  }
}
</style>
