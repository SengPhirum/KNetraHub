<script setup lang="ts">
const props = defineProps<{ serviceId: string; data: any; initialTab?: string }>()
const emit = defineEmits<{ saved: [] }>()
const open = defineModel<boolean>('open', { default: false })
const toast = useToast()

type TabKey = 'general' | 'network' | 'environment' | 'resources' | 'deployment' | 'logs'
const TABS: Array<{ key: TabKey; label: string; icon: string; description: string }> = [
  { key: 'general', label: 'General', icon: 'i-lucide-info', description: 'Image, mode and command' },
  { key: 'network', label: 'Network', icon: 'i-lucide-network', description: 'Networks, ports and hosts' },
  { key: 'environment', label: 'Environment', icon: 'i-lucide-variable', description: 'Variables, mounts, configs and secrets' },
  { key: 'resources', label: 'Resources', icon: 'i-lucide-cpu', description: 'CPU and memory reservation / limit' },
  { key: 'deployment', label: 'Deployment', icon: 'i-lucide-rocket', description: 'Labels, placement and update behavior' },
  { key: 'logs', label: 'Logs', icon: 'i-lucide-scroll-text', description: 'Log driver and options' }
]
const activeTab = ref<TabKey>('general')
const saving = ref(false)
const loadingOptions = ref(false)

// ── General ────────────────────────────────────────────────────────────────
const imageRepo = ref('')
const imageTag = ref('')
const mode = ref<'replicated' | 'global'>('replicated')
const replicas = ref<number | null>(1)
const command = ref('')

// ── Network ────────────────────────────────────────────────────────────────
const availableNetworks = ref<Array<{ id: string; name: string; scope?: string; driver?: string }>>([])
const selectedNetworks = ref<string[]>([])
const portRows = ref<Array<{ target: number | null; published: number | null; protocol: 'tcp' | 'udp'; mode: 'ingress' | 'host' }>>([])
const extraHostRows = ref<string[]>([])

// ── Environment ────────────────────────────────────────────────────────────
const envRows = ref<Array<{ key: string; value: string }>>([])
const availableVolumes = ref<Array<{ name: string }>>([])
const mountRows = ref<Array<{ type: 'bind' | 'volume' | 'tmpfs'; source: string; target: string; readOnly: boolean }>>([])
const availableConfigs = ref<Array<{ id: string; name: string }>>([])
const configRowsModel = ref<Array<{ configId: string; configName: string; fileName: string }>>([])
const availableSecrets = ref<Array<{ id: string; name: string }>>([])
const secretRowsModel = ref<Array<{ secretId: string; secretName: string; fileName: string }>>([])

// ── Resources ──────────────────────────────────────────────────────────────
const reservationCpu = ref<number | null>(null)
const reservationMemoryMiB = ref<number | null>(null)
const limitCpu = ref<number | null>(null)
const limitMemoryMiB = ref<number | null>(null)

// ── Deployment ─────────────────────────────────────────────────────────────
const labelRows = ref<Array<{ key: string; value: string }>>([])
const autoredeploy = ref(false)
const constraintRows = ref<string[]>([])
const restartCondition = ref<'any' | 'none' | 'on-failure'>('any')
const restartDelay = ref<number | null>(null)
const restartWindow = ref<number | null>(null)
const restartMaxAttempts = ref<number | null>(null)
const updateParallelism = ref<number | null>(1)
const updateDelay = ref<number | null>(null)
const updateOrder = ref<'stop-first' | 'start-first'>('stop-first')
const updateFailureAction = ref<'pause' | 'continue' | 'rollback'>('pause')
const rollbackParallelism = ref<number | null>(1)
const rollbackDelay = ref<number | null>(null)
const rollbackOrder = ref<'stop-first' | 'start-first'>('stop-first')
const rollbackFailureAction = ref<'pause' | 'continue'>('pause')

// ── Logs ───────────────────────────────────────────────────────────────────
const logDriverName = ref('')
const logDriverOptions = ref<Array<{ key: string; value: string }>>([])

const conditionItems = ['any', 'none', 'on-failure']
const orderItems = ['stop-first', 'start-first']
const updateFailureActionItems = ['pause', 'continue', 'rollback']
const rollbackFailureActionItems = ['pause', 'continue']
const protocolItems = ['tcp', 'udp']
const portModeItems = ['ingress', 'host']
const mountTypeItems = ['bind', 'volume', 'tmpfs']

function nsToSeconds(ns?: number | null) { return ns ? ns / 1e9 : null }

// ── Payload builders (also used to snapshot "initial" state for dirty checks) ─
function generalPayload() {
  return { image: `${imageRepo.value}:${imageTag.value || 'latest'}`, replicas: replicas.value, command: command.value.trim() }
}
function networkPayload() { return { networkIds: [...selectedNetworks.value].sort() } }
function portsPayload() { return { ports: portRows.value.filter((r) => r.target) } }
function extraHostsPayload() { return { hosts: extraHostRows.value.map((h) => h.trim()).filter(Boolean) } }
function envPayload() { return { env: envRows.value.filter((r) => r.key.trim()) } }
function mountsPayload() { return { mounts: mountRows.value.filter((r) => r.target).map((r) => ({ type: r.type, source: r.source || undefined, target: r.target, readOnly: r.readOnly })) } }
function configsPayload() { return { configs: configRowsModel.value.filter((r) => r.configId).map((r) => ({ configId: r.configId, configName: r.configName, fileName: r.fileName })) } }
function secretsPayload() { return { secrets: secretRowsModel.value.filter((r) => r.secretId).map((r) => ({ secretId: r.secretId, secretName: r.secretName, fileName: r.fileName })) } }
function resourcesPayload() {
  return {
    reservation: { nanoCpus: reservationCpu.value ? Math.round(reservationCpu.value * 1e9) : undefined, memoryBytes: reservationMemoryMiB.value ? Math.round(reservationMemoryMiB.value * 1024 * 1024) : undefined },
    limit: { nanoCpus: limitCpu.value ? Math.round(limitCpu.value * 1e9) : undefined, memoryBytes: limitMemoryMiB.value ? Math.round(limitMemoryMiB.value * 1024 * 1024) : undefined }
  }
}
function deploymentPayload() {
  return {
    labels: Object.fromEntries(labelRows.value.filter((r) => r.key.trim()).map((r) => [r.key.trim(), r.value])),
    autoredeploy: autoredeploy.value,
    constraints: constraintRows.value.map((c) => c.trim()).filter(Boolean),
    restartPolicy: { condition: restartCondition.value, delay: restartDelay.value ?? 0, window: restartWindow.value ?? 0, maxAttempts: restartMaxAttempts.value ?? 0 },
    updateConfig: { parallelism: updateParallelism.value ?? 1, delay: updateDelay.value ?? 0, order: updateOrder.value, failureAction: updateFailureAction.value },
    rollbackConfig: { parallelism: rollbackParallelism.value ?? 1, delay: rollbackDelay.value ?? 0, order: rollbackOrder.value, failureAction: rollbackFailureAction.value }
  }
}
function logDriverPayload() {
  return { name: logDriverName.value.trim(), options: Object.fromEntries(logDriverOptions.value.filter((r) => r.key.trim()).map((r) => [r.key.trim(), r.value])) }
}

const snapshot: Record<string, string> = {}
function takeSnapshot() {
  snapshot.general = JSON.stringify(generalPayload())
  snapshot.network = JSON.stringify(networkPayload())
  snapshot.ports = JSON.stringify(portsPayload())
  snapshot.extraHosts = JSON.stringify(extraHostsPayload())
  snapshot.env = JSON.stringify(envPayload())
  snapshot.mounts = JSON.stringify(mountsPayload())
  snapshot.configs = JSON.stringify(configsPayload())
  snapshot.secrets = JSON.stringify(secretsPayload())
  snapshot.resources = JSON.stringify(resourcesPayload())
  snapshot.deployment = JSON.stringify(deploymentPayload())
  snapshot.logDriver = JSON.stringify(logDriverPayload())
}
function dirty(key: string, payload: () => any) {
  return JSON.stringify(payload()) !== snapshot[key]
}

function populateFromData() {
  const d = props.data || {}
  const summary = d.summary || {}

  imageRepo.value = summary.imageRepository || summary.repository || ''
  imageTag.value = summary.tag || 'latest'
  mode.value = summary.mode === 'global' ? 'global' : 'replicated'
  replicas.value = summary.replicas ?? 1
  command.value = summary.command || ''

  selectedNetworks.value = (d.networks || []).map((n: any) => n.id)
  portRows.value = (d.ports || []).map((p: any) => ({ target: p.target, published: p.published, protocol: p.protocol === 'udp' ? 'udp' : 'tcp', mode: p.mode === 'host' ? 'host' : 'ingress' }))
  extraHostRows.value = d.extraHosts?.length ? [...d.extraHosts] : []

  envRows.value = (d.environment || []).map((e: any) => ({ ...e }))
  mountRows.value = (d.mounts || []).map((m: any) => ({ type: m.type === 'bind' || m.type === 'tmpfs' ? m.type : 'volume', source: m.source || '', target: m.target || '', readOnly: !!m.readOnly }))
  configRowsModel.value = (d.configs || []).map((c: any) => ({ configId: c.id, configName: c.name, fileName: c.fileName || c.name }))
  secretRowsModel.value = (d.secrets || []).map((s: any) => ({ secretId: s.id, secretName: s.name, fileName: s.fileName || s.name }))

  reservationCpu.value = summary.resources?.reservedNanoCpus ? summary.resources.reservedNanoCpus / 1e9 : null
  reservationMemoryMiB.value = summary.resources?.reservedMemoryBytes ? Math.round(summary.resources.reservedMemoryBytes / 1024 / 1024) : null
  limitCpu.value = summary.resources?.limitNanoCpus ? summary.resources.limitNanoCpus / 1e9 : null
  limitMemoryMiB.value = summary.resources?.limitMemoryBytes ? Math.round(summary.resources.limitMemoryBytes / 1024 / 1024) : null

  const serviceLabels = { ...(d.labels?.service || {}) }
  delete serviceLabels['knetrahub.autoredeploy']
  labelRows.value = Object.entries(serviceLabels).map(([key, value]) => ({ key, value: String(value) }))
  autoredeploy.value = !!d.autoredeploy
  constraintRows.value = d.placement?.Constraints?.length ? [...d.placement.Constraints] : []
  restartCondition.value = d.restartPolicy?.Condition || 'any'
  restartDelay.value = nsToSeconds(d.restartPolicy?.Delay)
  restartWindow.value = nsToSeconds(d.restartPolicy?.Window)
  restartMaxAttempts.value = d.restartPolicy?.MaxAttempts ?? null
  updateParallelism.value = d.updateConfig?.Parallelism ?? 1
  updateDelay.value = nsToSeconds(d.updateConfig?.Delay)
  updateOrder.value = d.updateConfig?.Order || 'stop-first'
  updateFailureAction.value = d.updateConfig?.FailureAction || 'pause'
  rollbackParallelism.value = d.rollbackConfig?.Parallelism ?? 1
  rollbackDelay.value = nsToSeconds(d.rollbackConfig?.Delay)
  rollbackOrder.value = d.rollbackConfig?.Order || 'stop-first'
  rollbackFailureAction.value = d.rollbackConfig?.FailureAction || 'pause'

  logDriverName.value = d.logDriver?.name || ''
  logDriverOptions.value = Object.entries(d.logDriver?.options || {}).map(([key, value]) => ({ key, value: String(value) }))

  takeSnapshot()
}

watch(open, async (v) => {
  if (!v) return
  activeTab.value = (props.initialTab as TabKey) || 'general'
  populateFromData()
  loadingOptions.value = true
  try {
    const [networks, volumes, configsList, secretsList] = await Promise.all([
      $fetch<any[]>('/api/networks'),
      $fetch<any[]>('/api/volumes'),
      $fetch<any[]>('/api/configs'),
      $fetch<any[]>('/api/secrets')
    ])
    availableNetworks.value = networks.filter((n) => n.scope === 'swarm' || n.driver === 'overlay')
    availableVolumes.value = volumes
    availableConfigs.value = configsList
    availableSecrets.value = secretsList
  } catch {
    // leave option lists empty - the form still works for already-attached items
  } finally {
    loadingOptions.value = false
  }
})

const networkItems = computed(() => availableNetworks.value.map((n) => ({ label: n.name, value: n.id })))
const volumeItems = computed(() => availableVolumes.value.map((v) => ({ label: v.name, value: v.name })))
const configItems = computed(() => availableConfigs.value.map((c) => ({ label: c.name, value: c.id })))
const secretItems = computed(() => availableSecrets.value.map((s) => ({ label: s.name, value: s.id })))

const tabIndex = computed(() => TABS.findIndex((t) => t.key === activeTab.value))
function goPrev() { if (tabIndex.value > 0) activeTab.value = TABS[tabIndex.value - 1]!.key }
function goNext() { if (tabIndex.value < TABS.length - 1) activeTab.value = TABS[tabIndex.value + 1]!.key }

function addPortRow() { portRows.value.push({ target: null, published: null, protocol: 'tcp', mode: 'ingress' }) }
function addExtraHostRow() { extraHostRows.value.push('') }
function addEnvRow() { envRows.value.push({ key: '', value: '' }) }
function addMountRow() { mountRows.value.push({ type: 'volume', source: '', target: '', readOnly: false }) }
function addConfigRow() { configRowsModel.value.push({ configId: '', configName: '', fileName: '' }) }
function addSecretRow() { secretRowsModel.value.push({ secretId: '', secretName: '', fileName: '' }) }
function addLabelRow() { labelRows.value.push({ key: '', value: '' }) }
function addConstraintRow() { constraintRows.value.push('') }
function addLogOptionRow() { logDriverOptions.value.push({ key: '', value: '' }) }
function onPickConfig(row: { configId: string; configName: string; fileName: string }) {
  const match = availableConfigs.value.find((c) => c.id === row.configId)
  if (match) { row.configName = match.name; if (!row.fileName) row.fileName = match.name }
}
function onPickSecret(row: { secretId: string; secretName: string; fileName: string }) {
  const match = availableSecrets.value.find((s) => s.id === row.secretId)
  if (match) { row.secretName = match.name; if (!row.fileName) row.fileName = match.name }
}

async function save() {
  saving.value = true
  try {
    const id = props.serviceId
    const calls: Array<() => Promise<any>> = []

    if (dirty('general', generalPayload)) {
      const g = generalPayload()
      if (g.image !== `${snapshot.general ? JSON.parse(snapshot.general).image : ''}`) {
        calls.push(() => $fetch(`/api/services/${id}/image`, { method: 'POST', body: { image: g.image } }))
      }
      const initial = snapshot.general ? JSON.parse(snapshot.general) : {}
      if (mode.value === 'replicated' && g.replicas !== initial.replicas) {
        calls.push(() => $fetch(`/api/services/${id}/scale`, { method: 'POST', body: { replicas: Number(g.replicas) } }))
      }
      if (g.command !== initial.command) {
        calls.push(() => $fetch(`/api/services/${id}/command`, { method: 'POST', body: { command: g.command } }))
      }
    }
    if (dirty('network', networkPayload)) calls.push(() => $fetch(`/api/services/${id}/networks`, { method: 'POST', body: networkPayload() }))
    if (dirty('ports', portsPayload)) calls.push(() => $fetch(`/api/services/${id}/ports`, { method: 'POST', body: portsPayload() }))
    if (dirty('extraHosts', extraHostsPayload)) calls.push(() => $fetch(`/api/services/${id}/extra-hosts`, { method: 'POST', body: extraHostsPayload() }))
    if (dirty('env', envPayload)) calls.push(() => $fetch(`/api/services/${id}/environment`, { method: 'POST', body: envPayload() }))
    if (dirty('mounts', mountsPayload)) calls.push(() => $fetch(`/api/services/${id}/mounts`, { method: 'POST', body: mountsPayload() }))
    if (dirty('configs', configsPayload)) calls.push(() => $fetch(`/api/services/${id}/configs`, { method: 'POST', body: configsPayload() }))
    if (dirty('secrets', secretsPayload)) calls.push(() => $fetch(`/api/services/${id}/secrets`, { method: 'POST', body: secretsPayload() }))
    if (dirty('resources', resourcesPayload)) calls.push(() => $fetch(`/api/services/${id}/resources`, { method: 'POST', body: resourcesPayload() }))
    if (dirty('deployment', deploymentPayload)) calls.push(() => $fetch(`/api/services/${id}/deployment`, { method: 'POST', body: deploymentPayload() }))
    if (dirty('logDriver', logDriverPayload)) calls.push(() => $fetch(`/api/services/${id}/log-driver`, { method: 'POST', body: logDriverPayload() }))

    if (!calls.length) {
      open.value = false
      return
    }
    // Sequential, not parallel: each endpoint re-inspects the service to get
    // a fresh version index right before update() - running them in
    // parallel would race multiple updates against the same stale version.
    for (const call of calls) await call()

    toast.add({ title: 'Service updated', color: 'primary', icon: 'i-lucide-check' })
    emit('saved')
    open.value = false
  } catch (e: any) {
    toast.add({ title: 'Update failed', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" title="Edit service" description="Configure every aspect of this service, organized like a deploy wizard." :dismissible="false" :ui="{ content: 'max-w-5xl' }">
    <template #body>
      <div class="flex flex-col gap-4 sm:flex-row sm:gap-6">
        <!-- Tab rail: horizontal scroller on mobile, vertical sidebar from sm+ -->
        <nav class="flex shrink-0 gap-1.5 overflow-x-auto pb-1 sm:w-48 sm:flex-col sm:gap-1 sm:overflow-visible sm:border-r sm:border-hull sm:pr-4 sm:pb-0">
          <button
            v-for="t in TABS"
            :key="t.key"
            type="button"
            class="flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition sm:w-full"
            :class="activeTab === t.key ? 'bg-beacon/12 text-beacon' : 'text-faint hover:bg-surface-2 hover:text-foam'"
            @click="activeTab = t.key"
          >
            <UIcon :name="t.icon" class="size-4 shrink-0" />
            <span class="whitespace-nowrap">{{ t.label }}</span>
          </button>
        </nav>

        <div class="min-w-0 flex-1">
          <div class="mb-3">
            <p class="font-display text-base font-semibold text-foam">{{ TABS[tabIndex]?.label }}</p>
            <p class="text-xs text-faint">{{ TABS[tabIndex]?.description }}</p>
          </div>

          <div class="max-h-[55vh] space-y-3 overflow-y-auto pr-1 sm:max-h-[62vh]">
            <!-- General -->
            <template v-if="activeTab === 'general'">
              <div class="field-card">
                <p class="field-card-title">Image</p>
                <div class="grid gap-3 sm:grid-cols-2">
                  <UFormField label="Repository" required>
                    <UInput v-model="imageRepo" class="w-full font-mono" placeholder="nginx" :disabled="saving" />
                  </UFormField>
                  <UFormField label="Tag">
                    <UInput v-model="imageTag" class="w-full font-mono" placeholder="latest" :disabled="saving" />
                  </UFormField>
                </div>
              </div>

              <div class="field-card">
                <p class="field-card-title">Mode &amp; scale</p>
                <div class="space-y-4">
                  <UFormField label="Mode" description="Mode can't be changed after a service is created.">
                    <div class="flex gap-4 text-sm">
                      <span class="flex items-center gap-1.5" :class="mode === 'replicated' ? 'text-foam' : 'text-faint'"><UIcon :name="mode === 'replicated' ? 'i-lucide-circle-dot' : 'i-lucide-circle'" class="size-4" /> Replicated</span>
                      <span class="flex items-center gap-1.5" :class="mode === 'global' ? 'text-foam' : 'text-faint'"><UIcon :name="mode === 'global' ? 'i-lucide-circle-dot' : 'i-lucide-circle'" class="size-4" /> Global</span>
                    </div>
                  </UFormField>
                  <UFormField v-if="mode === 'replicated'" label="Replicas">
                    <UInput v-model="replicas" type="number" min="0" class="w-full sm:w-40" :disabled="saving" />
                  </UFormField>
                </div>
              </div>

              <div class="field-card">
                <p class="field-card-title">Command</p>
                <UFormField description="Overrides the image's default command.">
                  <UInput v-model="command" class="w-full font-mono" placeholder="nginx -g &quot;daemon off;&quot;" :disabled="saving" />
                </UFormField>
              </div>
            </template>

            <!-- Network -->
            <template v-else-if="activeTab === 'network'">
              <div class="field-card">
                <p class="field-card-title">Networks</p>
                <USelectMenu v-model="selectedNetworks" :items="networkItems" value-key="value" label-key="label" multiple placeholder="Attach to network" class="w-full" :loading="loadingOptions" :disabled="saving" />
              </div>
              <div class="field-card">
                <div class="field-card-header">
                  <p class="field-card-title">Ports</p>
                  <UButton icon="i-lucide-plus" color="neutral" variant="soft" size="xs" label="Add port" :disabled="saving" @click="addPortRow" />
                </div>
                <p v-if="!portRows.length" class="field-card-empty">No published ports.</p>
                <div class="space-y-2">
                  <div v-for="(row, i) in portRows" :key="i" class="flex items-center gap-2">
                    <UInput v-model="row.target" type="number" min="1" class="w-1/4" placeholder="container" :disabled="saving" />
                    <UInput v-model="row.published" type="number" min="1" class="w-1/4" placeholder="host" :disabled="saving" />
                    <USelect v-model="row.protocol" :items="protocolItems" class="w-1/4" :disabled="saving" />
                    <USelect v-model="row.mode" :items="portModeItems" class="w-1/4" :disabled="saving" />
                    <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="sm" :disabled="saving" @click="portRows.splice(i, 1)" />
                  </div>
                </div>
              </div>
              <div class="field-card">
                <div class="field-card-header">
                  <p class="field-card-title">Extra hosts</p>
                  <UButton icon="i-lucide-plus" color="neutral" variant="soft" size="xs" label="Add host mapping" :disabled="saving" @click="addExtraHostRow" />
                </div>
                <p v-if="!extraHostRows.length" class="field-card-empty">No extra hosts defined.</p>
                <div class="space-y-2">
                  <div v-for="(row, i) in extraHostRows" :key="i" class="flex items-center gap-2">
                    <UInput v-model="extraHostRows[i]" class="w-full font-mono" placeholder="10.0.0.1 somehost" :disabled="saving" />
                    <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="sm" :disabled="saving" @click="extraHostRows.splice(i, 1)" />
                  </div>
                </div>
              </div>
            </template>

            <!-- Environment -->
            <template v-else-if="activeTab === 'environment'">
              <div class="field-card">
                <div class="field-card-header">
                  <p class="field-card-title">Variables</p>
                  <UButton icon="i-lucide-plus" color="neutral" variant="soft" size="xs" label="Add variable" :disabled="saving" @click="addEnvRow" />
                </div>
                <p v-if="!envRows.length" class="field-card-empty">No environment variables defined.</p>
                <div class="space-y-2">
                  <div v-for="(row, i) in envRows" :key="i" class="flex items-center gap-2">
                    <UInput v-model="row.key" class="w-2/5 font-mono" placeholder="KEY" :disabled="saving" />
                    <UInput v-model="row.value" class="w-full font-mono" placeholder="value" :disabled="saving" />
                    <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="sm" :disabled="saving" @click="envRows.splice(i, 1)" />
                  </div>
                </div>
              </div>
              <div class="field-card">
                <div class="field-card-header">
                  <p class="field-card-title">Mounts</p>
                  <UButton icon="i-lucide-plus" color="neutral" variant="soft" size="xs" label="Add mount" :disabled="saving" @click="addMountRow" />
                </div>
                <p v-if="!mountRows.length" class="field-card-empty">No mounts defined.</p>
                <div class="space-y-2">
                  <div v-for="(row, i) in mountRows" :key="i" class="flex items-center gap-2">
                    <USelect v-model="row.type" :items="mountTypeItems" class="w-28" :disabled="saving" />
                    <USelectMenu v-if="row.type === 'volume'" v-model="row.source" :items="volumeItems" value-key="value" label-key="label" placeholder="volume" class="w-1/3" :loading="loadingOptions" :disabled="saving" />
                    <UInput v-else-if="row.type === 'bind'" v-model="row.source" class="w-1/3 font-mono" placeholder="/host/path" :disabled="saving" />
                    <span v-else class="w-1/3 text-xs text-faint">in-memory</span>
                    <UInput v-model="row.target" class="w-full font-mono" placeholder="/container/path" :disabled="saving" />
                    <UCheckbox v-model="row.readOnly" label="RO" :disabled="saving" />
                    <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="sm" :disabled="saving" @click="mountRows.splice(i, 1)" />
                  </div>
                </div>
              </div>
              <div class="field-card">
                <div class="field-card-header">
                  <p class="field-card-title">Configs</p>
                  <UButton icon="i-lucide-plus" color="neutral" variant="soft" size="xs" label="Add config" :disabled="saving" @click="addConfigRow" />
                </div>
                <p v-if="!configRowsModel.length" class="field-card-empty">{{ !availableConfigs.length && !loadingOptions ? 'No configs defined for the service.' : 'No configs attached.' }}</p>
                <div class="space-y-2">
                  <div v-for="(row, i) in configRowsModel" :key="i" class="flex items-center gap-2">
                    <USelect v-model="row.configId" :items="configItems" value-key="value" label-key="label" placeholder="Name" class="w-1/2" :loading="loadingOptions" :disabled="saving" @update:model-value="onPickConfig(row)" />
                    <UInput v-model="row.fileName" class="w-full font-mono" placeholder="Target" :disabled="saving" />
                    <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="sm" :disabled="saving" @click="configRowsModel.splice(i, 1)" />
                  </div>
                </div>
              </div>
              <div class="field-card">
                <div class="field-card-header">
                  <p class="field-card-title">Secrets</p>
                  <UButton icon="i-lucide-plus" color="neutral" variant="soft" size="xs" label="Add secret" :disabled="saving" @click="addSecretRow" />
                </div>
                <p v-if="!secretRowsModel.length" class="field-card-empty">No secrets attached.</p>
                <div class="space-y-2">
                  <div v-for="(row, i) in secretRowsModel" :key="i" class="flex items-center gap-2">
                    <USelect v-model="row.secretId" :items="secretItems" value-key="value" label-key="label" placeholder="Name" class="w-1/2" :loading="loadingOptions" :disabled="saving" @update:model-value="onPickSecret(row)" />
                    <UInput v-model="row.fileName" class="w-full font-mono" placeholder="Target" :disabled="saving" />
                    <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="sm" :disabled="saving" @click="secretRowsModel.splice(i, 1)" />
                  </div>
                </div>
              </div>
            </template>

            <!-- Resources -->
            <template v-else-if="activeTab === 'resources'">
              <p class="text-xs text-(--color-muted)">Per-replica. Leave memory blank for unlimited; CPU 0 also means unlimited.</p>
              <div class="grid gap-4 sm:grid-cols-2">
                <div class="field-card">
                  <p class="field-card-title">Reservation</p>
                  <p class="mb-3 text-xs text-faint">Guaranteed minimum the scheduler reserves on a node.</p>
                  <div class="space-y-4">
                    <UFormField label="Memory (MiB)"><UInput v-model="reservationMemoryMiB" type="number" min="0" class="w-full" :disabled="saving" /></UFormField>
                    <UFormField :label="`CPU — ${reservationCpu ?? 0} vCPU`">
                      <div class="flex items-center gap-3">
                        <input v-model.number="reservationCpu" type="range" min="0" max="8" step="0.05" class="w-full" :disabled="saving">
                        <UInput v-model.number="reservationCpu" type="number" min="0" max="8" step="0.05" class="w-20 shrink-0 font-mono" :disabled="saving" />
                      </div>
                    </UFormField>
                  </div>
                </div>
                <div class="field-card">
                  <p class="field-card-title">Limit</p>
                  <p class="mb-3 text-xs text-faint">Hard ceiling enforced on the running container.</p>
                  <div class="space-y-4">
                    <UFormField label="Memory (MiB)"><UInput v-model="limitMemoryMiB" type="number" min="0" class="w-full" :disabled="saving" /></UFormField>
                    <UFormField :label="`CPU — ${limitCpu ?? 0} vCPU`">
                      <div class="flex items-center gap-3">
                        <input v-model.number="limitCpu" type="range" min="0" max="8" step="0.05" class="w-full" :disabled="saving">
                        <UInput v-model.number="limitCpu" type="number" min="0" max="8" step="0.05" class="w-20 shrink-0 font-mono" :disabled="saving" />
                      </div>
                    </UFormField>
                  </div>
                </div>
              </div>
            </template>

            <!-- Deployment -->
            <template v-else-if="activeTab === 'deployment'">
              <div class="field-card">
                <div class="field-card-header">
                  <p class="field-card-title">Labels</p>
                  <UButton icon="i-lucide-plus" color="neutral" variant="soft" size="xs" label="Add label" :disabled="saving" @click="addLabelRow" />
                </div>
                <p v-if="!labelRows.length" class="field-card-empty">No labels defined for the service.</p>
                <div class="space-y-2">
                  <div v-for="(row, i) in labelRows" :key="i" class="flex items-center gap-2">
                    <UInput v-model="row.key" class="w-2/5 font-mono" placeholder="key" :disabled="saving" />
                    <UInput v-model="row.value" class="w-full font-mono" placeholder="value" :disabled="saving" />
                    <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="sm" :disabled="saving" @click="labelRows.splice(i, 1)" />
                  </div>
                </div>
              </div>

              <div class="field-card flex items-center justify-between gap-3">
                <div class="flex items-center gap-3">
                  <UIcon name="i-lucide-refresh-cw-off" class="size-5 text-faint" />
                  <div>
                    <p class="field-card-title">Autoredeploy</p>
                    <p class="text-xs text-faint">Periodically check the registry for a new image digest and roll the service forward automatically.</p>
                  </div>
                </div>
                <USwitch v-model="autoredeploy" :disabled="saving" />
              </div>

              <div class="field-card">
                <div class="field-card-header">
                  <p class="field-card-title">Placement</p>
                  <UButton icon="i-lucide-plus" color="neutral" variant="soft" size="xs" label="Add constraint" :disabled="saving" @click="addConstraintRow" />
                </div>
                <p v-if="!constraintRows.length" class="field-card-empty">No placement constraints.</p>
                <div class="space-y-2">
                  <div v-for="(row, i) in constraintRows" :key="i" class="flex items-center gap-2">
                    <UInput v-model="constraintRows[i]" class="w-full font-mono" placeholder="node.role==worker" :disabled="saving" />
                    <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="sm" :disabled="saving" @click="constraintRows.splice(i, 1)" />
                  </div>
                </div>
              </div>

              <div class="grid gap-4 sm:grid-cols-3">
                <div class="field-card">
                  <p class="field-card-title">Restart policy</p>
                  <div class="space-y-3">
                    <UFormField label="Condition"><USelect v-model="restartCondition" :items="conditionItems" class="w-full" :disabled="saving" /></UFormField>
                    <UFormField label="Delay (s)"><UInput v-model="restartDelay" type="number" min="0" class="w-full" :disabled="saving" /></UFormField>
                    <UFormField label="Window (s)"><UInput v-model="restartWindow" type="number" min="0" class="w-full" :disabled="saving" /></UFormField>
                    <UFormField label="Attempts" description="0 = unlimited"><UInput v-model="restartMaxAttempts" type="number" min="0" class="w-full" :disabled="saving" /></UFormField>
                  </div>
                </div>
                <div class="field-card">
                  <p class="field-card-title">Update config</p>
                  <div class="space-y-3">
                    <UFormField label="Parallelism"><UInput v-model="updateParallelism" type="number" min="1" class="w-full" :disabled="saving" /></UFormField>
                    <UFormField label="Delay (s)"><UInput v-model="updateDelay" type="number" min="0" class="w-full" :disabled="saving" /></UFormField>
                    <UFormField label="Order"><USelect v-model="updateOrder" :items="orderItems" class="w-full" :disabled="saving" /></UFormField>
                    <UFormField label="Failure action"><USelect v-model="updateFailureAction" :items="updateFailureActionItems" class="w-full" :disabled="saving" /></UFormField>
                  </div>
                </div>
                <div class="field-card">
                  <p class="field-card-title">Rollback config</p>
                  <div class="space-y-3">
                    <UFormField label="Parallelism"><UInput v-model="rollbackParallelism" type="number" min="1" class="w-full" :disabled="saving" /></UFormField>
                    <UFormField label="Delay (s)"><UInput v-model="rollbackDelay" type="number" min="0" class="w-full" :disabled="saving" /></UFormField>
                    <UFormField label="Order"><USelect v-model="rollbackOrder" :items="orderItems" class="w-full" :disabled="saving" /></UFormField>
                    <UFormField label="Failure action"><USelect v-model="rollbackFailureAction" :items="rollbackFailureActionItems" class="w-full" :disabled="saving" /></UFormField>
                  </div>
                </div>
              </div>
            </template>

            <!-- Logs -->
            <template v-else-if="activeTab === 'logs'">
              <div class="field-card">
                <p class="field-card-title">Driver</p>
                <UFormField label="Log driver">
                  <UInput v-model="logDriverName" class="w-full font-mono" placeholder="json-file" :disabled="saving" />
                </UFormField>
              </div>
              <div class="field-card">
                <div class="field-card-header">
                  <p class="field-card-title">Driver options</p>
                  <UButton icon="i-lucide-plus" color="neutral" variant="soft" size="xs" label="Add option" :disabled="saving" @click="addLogOptionRow" />
                </div>
                <p v-if="!logDriverOptions.length" class="field-card-empty">No driver options set.</p>
                <div class="space-y-2">
                  <div v-for="(row, i) in logDriverOptions" :key="i" class="flex items-center gap-2">
                    <UInput v-model="row.key" class="w-2/5 font-mono" placeholder="max-size" :disabled="saving" />
                    <UInput v-model="row.value" class="w-full font-mono" placeholder="10m" :disabled="saving" />
                    <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="sm" :disabled="saving" @click="logDriverOptions.splice(i, 1)" />
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full items-center justify-between gap-2">
        <UButton color="primary" icon="i-lucide-rocket" label="Deploy" :loading="saving" @click="save" />
        <div class="flex items-center gap-3">
          <span class="hidden text-xs text-faint sm:inline">{{ tabIndex + 1 }} / {{ TABS.length }}</span>
          <UButton color="neutral" variant="ghost" label="Previous" :disabled="saving || tabIndex === 0" @click="goPrev" />
          <UButton color="neutral" variant="ghost" label="Next" :disabled="saving || tabIndex === TABS.length - 1" @click="goNext" />
        </div>
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
</style>
