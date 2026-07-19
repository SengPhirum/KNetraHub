<script setup lang="ts">
import type { RuntimeModule } from '../composables/useModules'

const props = defineProps<{ modules: RuntimeModule[]; initialKey?: string }>()
const emit = defineEmits<{ complete: [] }>()
const open = defineModel<boolean>('open', { default: false })
const toast = useToast()

const step = ref(1)
const selected = ref<string[]>([])
const initializing = ref(false)
const currentModule = ref('')
const error = ref('')

interface DbForm {
  mode: 'portal-host' | 'custom-host'
  database: string
  host: string
  port: number
  user: string
  password: string
  ssl: boolean
  adminDatabase: string
  poolMax: number
}

const forms = reactive<Record<string, DbForm>>({})

function formFor(key: string): DbForm {
  return forms[key] as DbForm
}

function locationFor(module: RuntimeModule): string {
  if (module.initializedAt) return 'Reconnect existing dedicated database'
  const form = formFor(module.key)
  const host = form.mode === 'portal-host' ? 'Portal host' : `${form.host}:${form.port}`
  return `${host} / ${form.database}`
}

function reset() {
  step.value = 1
  error.value = ''
  currentModule.value = ''
  selected.value = props.initialKey ? [props.initialKey] : []
  for (const module of props.modules) {
    forms[module.key] = {
      mode: module.database?.mode || 'portal-host',
      database: module.database?.database || module.defaultDatabase,
      host: module.database?.mode === 'custom-host' ? module.database.host : '',
      port: module.database?.port || 5432,
      user: module.database?.mode === 'custom-host' ? module.database.user : '',
      password: '',
      ssl: module.database?.ssl || false,
      adminDatabase: module.database?.mode === 'custom-host' ? 'postgres' : '',
      poolMax: module.database?.poolMax || module.defaultPoolMax
    }
  }
}

watch(open, (value) => { if (value) reset() })

const selectableModules = computed(() => props.modules.filter((module) => !module.enabled))
const selectedModules = computed(() => props.modules.filter((module) => selected.value.includes(module.key)))

function toggle(key: string, checked: boolean | 'indeterminate') {
  if (checked === true && !selected.value.includes(key)) selected.value.push(key)
  if (checked !== true) selected.value = selected.value.filter((item) => item !== key)
}

function next() {
  error.value = ''
  if (step.value === 1 && !selected.value.length) {
    error.value = 'Select at least one built-in module.'
    return
  }
  if (step.value === 2) {
    for (const module of selectedModules.value.filter((item) => !item.initializedAt)) {
      const form = forms[module.key]!
      if (!form.database.trim()) return void (error.value = `${module.name}: database name is required.`)
      if (form.mode === 'custom-host' && (!form.host.trim() || !form.user.trim() || !form.password)) {
        return void (error.value = `${module.name}: host, user, and password are required for a custom database host.`)
      }
    }
  }
  step.value++
}

async function initialize() {
  initializing.value = true
  error.value = ''
  const failures: string[] = []
  try {
    for (const module of selectedModules.value) {
      currentModule.value = module.name
      try {
        const body = module.initializedAt ? {} : { database: forms[module.key] }
        await $fetch(`/api/modules/${module.key}/enable`, { method: 'POST', body })
      } catch (exception: any) {
        failures.push(`${module.name}: ${exception?.data?.statusMessage || exception?.message || 'initialization failed'}`)
      }
    }
    const { fetchModules } = useModules()
    const { fetchMe } = useAuth()
    await Promise.all([fetchModules(true), fetchMe()])
    if (failures.length) {
      error.value = failures.join('\n')
      return
    }
    toast.add({ title: 'Modules initialized', description: 'The selected subsystems are ready to use.', color: 'primary', icon: 'i-lucide-check-check' })
    open.value = false
    emit('complete')
  } finally {
    initializing.value = false
    currentModule.value = ''
  }
}
</script>

<template>
  <UModal v-model:open="open" title="Initialize built-in modules" :ui="{ content: 'sm:max-w-3xl' }">
    <template #body>
      <div class="space-y-5">
        <div class="flex items-center gap-2 text-xs text-faint">
          <span v-for="n in 3" :key="n" class="flex items-center gap-2">
            <span class="flex size-6 items-center justify-center rounded-full font-semibold"
              :class="step >= n ? 'bg-beacon text-white' : 'bg-surface-2 text-faint ring-1 ring-hull'">{{ n }}</span>
            <span :class="step === n ? 'text-foam' : ''">{{ n === 1 ? 'Modules' : n === 2 ? 'Databases' : 'Confirm' }}</span>
            <span v-if="n < 3" class="h-px w-8 bg-hull" />
          </span>
        </div>

        <div v-if="step === 1" class="space-y-3">
          <div>
            <h3 class="font-display text-base font-semibold text-foam">Choose the systems this installation needs</h3>
            <p class="mt-1 text-sm text-muted">Nothing is enabled by default. You can add or disable modules later without deleting their databases.</p>
          </div>
          <label v-for="module in selectableModules" :key="module.key"
            class="flex cursor-pointer items-start gap-3 rounded-xl border border-hull bg-surface-2/60 p-4 transition hover:border-beacon/40">
            <UCheckbox :model-value="selected.includes(module.key)" class="mt-1" @update:model-value="toggle(module.key, $event)" />
            <span class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-beacon/10 ring-1 ring-beacon/20">
              <UIcon :name="module.icon" class="size-5 text-beacon" />
            </span>
            <span class="min-w-0">
              <span class="flex items-center gap-2 font-semibold text-foam">
                {{ module.name }}
                <UBadge v-if="module.initializedAt" color="neutral" variant="subtle" size="sm" label="Database retained" />
              </span>
              <span class="mt-1 block text-sm text-muted">{{ module.description }}</span>
            </span>
          </label>
        </div>

        <div v-else-if="step === 2" class="space-y-4">
          <div>
            <h3 class="font-display text-base font-semibold text-foam">Dedicated database configuration</h3>
            <p class="mt-1 text-sm text-muted">Each subsystem gets its own database. It may share the portal's host or use a completely separate host.</p>
          </div>
          <div v-for="module in selectedModules" :key="module.key" class="rounded-xl border border-hull p-4">
            <div class="mb-4 flex items-center gap-2">
              <UIcon :name="module.icon" class="size-5 text-beacon" />
              <h4 class="font-semibold text-foam">{{ module.name }}</h4>
              <UBadge v-if="module.initializedAt" color="success" variant="subtle" label="Will reconnect; no re-initialization" class="ml-auto" />
            </div>
            <template v-if="!module.initializedAt">
              <div class="grid gap-4 sm:grid-cols-3">
                <UFormField label="Database host">
                  <select v-model="formFor(module.key).mode" class="h-9 w-full rounded-md border border-hull bg-surface px-3 text-sm text-foam">
                    <option value="portal-host">Use portal database host</option>
                    <option value="custom-host">Use separate database host</option>
                  </select>
                </UFormField>
                <UFormField label="Dedicated database name">
                  <UInput v-model="formFor(module.key).database" class="w-full" />
                </UFormField>
                <UFormField label="Connection pool limit">
                  <UInput v-model.number="formFor(module.key).poolMax" type="number" min="2" max="100" class="w-full" />
                </UFormField>
              </div>
              <div v-if="formFor(module.key).mode === 'custom-host'" class="mt-4 grid gap-4 sm:grid-cols-2">
                <UFormField label="Host"><UInput v-model="formFor(module.key).host" placeholder="db.example.internal" class="w-full" /></UFormField>
                <UFormField label="Port"><UInput v-model.number="formFor(module.key).port" type="number" class="w-full" /></UFormField>
                <UFormField label="Database user (create privilege required)"><UInput v-model="formFor(module.key).user" autocomplete="off" class="w-full" /></UFormField>
                <UFormField label="Password"><UInput v-model="formFor(module.key).password" type="password" autocomplete="new-password" class="w-full" /></UFormField>
                <UFormField label="Administrative database"><UInput v-model="formFor(module.key).adminDatabase" placeholder="postgres" class="w-full" /></UFormField>
                <div class="flex items-end pb-2"><UCheckbox v-model="formFor(module.key).ssl" label="Require SSL" /></div>
              </div>
              <p v-if="module.key !== 'ipmgt'" class="mt-3 flex items-start gap-2 text-xs text-amber-400">
                <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-3.5 shrink-0" />
                This module uses TimescaleDB. The selected host must provide the TimescaleDB extension and the provisioning user must be able to enable it.
              </p>
            </template>
          </div>
        </div>

        <div v-else class="space-y-4">
          <div class="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <div class="flex items-start gap-3">
              <UIcon name="i-lucide-database-zap" class="mt-0.5 size-5 shrink-0 text-amber-400" />
              <div>
                <h3 class="font-semibold text-foam">Confirm database initialization</h3>
                <p class="mt-1 text-sm text-muted">KNetraHub will create each missing database and initialize only that module's schema. Existing databases will not be dropped. Re-enabling a previously initialized module does not run first-time initialization again.</p>
              </div>
            </div>
          </div>
          <div class="divide-y divide-hull rounded-xl border border-hull">
            <div v-for="module in selectedModules" :key="module.key" class="flex items-center gap-3 px-4 py-3">
              <UIcon :name="module.icon" class="size-5 text-beacon" />
              <div class="min-w-0 flex-1">
                <p class="font-medium text-foam">{{ module.name }}</p>
                <p class="truncate text-xs text-faint">
                  {{ locationFor(module) }}
                </p>
              </div>
              <UBadge color="primary" variant="subtle" :label="module.initializedAt ? 'Enable' : 'Create & initialize'" />
            </div>
          </div>
        </div>

        <p v-if="error" class="whitespace-pre-line rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-400">{{ error }}</p>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-between gap-3">
        <UButton variant="ghost" :disabled="initializing" @click="step === 1 ? (open = false) : step--">
          {{ step === 1 ? 'Cancel' : 'Back' }}
        </UButton>
        <UButton v-if="step < 3" trailing-icon="i-lucide-arrow-right" @click="next">Continue</UButton>
        <UButton v-else icon="i-lucide-database-zap" :loading="initializing" @click="initialize">
          {{ initializing ? `Initializing ${currentModule}…` : 'Confirm and initialize' }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
