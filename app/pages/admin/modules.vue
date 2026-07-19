<script setup lang="ts">
import type { RuntimeModule } from '../../composables/useModules'

definePageMeta({ middleware: 'admin' })

const toast = useToast()
const { modules, fetchModules } = useModules()
const setupOpen = ref(false)
const setupKey = ref<string>()
const disableOpen = ref(false)
const disableTarget = ref<RuntimeModule | null>(null)
const disabling = ref(false)

await fetchModules(true)

function configure(module?: RuntimeModule) {
  setupKey.value = module?.key
  setupOpen.value = true
}

function askDisable(module: RuntimeModule) {
  disableTarget.value = module
  disableOpen.value = true
}

async function disableModule() {
  if (!disableTarget.value) return
  disabling.value = true
  try {
    await $fetch(`/api/modules/${disableTarget.value.key}/disable`, { method: 'POST' })
    toast.add({
      title: `${disableTarget.value.name} disabled`,
      description: 'Its database and all module data were retained.',
      color: 'primary',
      icon: 'i-lucide-check'
    })
    disableOpen.value = false
    await Promise.all([fetchModules(true), useAuth().fetchMe()])
  } catch (error: any) {
    toast.add({ title: 'Disable failed', description: error?.data?.statusMessage || error?.message, color: 'error' })
  } finally {
    disabling.value = false
  }
}

function statusColor(status: RuntimeModule['status']): 'success' | 'warning' | 'error' | 'neutral' {
  if (status === 'ready') return 'success'
  if (status === 'initializing') return 'warning'
  if (status === 'error') return 'error'
  return 'neutral'
}

function fmtDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : 'Never initialized'
}
</script>

<template>
  <div>
    <PageHeader
      title="Modules"
      subtitle="Enable only the built-in systems this KNetraHub installation needs"
      icon="i-lucide-blocks"
    >
      <template #actions>
        <UButton icon="i-lucide-plus" :disabled="modules.every((module) => module.enabled)" @click="configure()">Enable modules</UButton>
      </template>
    </PageHeader>

    <div class="mb-4 rounded-xl border border-beacon/20 bg-beacon/5 p-4 text-sm text-muted">
      <div class="flex items-start gap-3">
        <UIcon name="i-lucide-shield-check" class="mt-0.5 size-5 shrink-0 text-beacon" />
        <p>
          Portal settings and identities stay in the main <strong class="text-foam">KNetraHub database</strong>.
          Every enabled subsystem uses a dedicated database, either on the portal PostgreSQL host or on a separately configured host.
          Disabling a module never deletes its data.
        </p>
      </div>
    </div>

    <div class="grid gap-4 xl:grid-cols-2">
      <section v-for="module in modules" :key="module.key" class="panel overflow-hidden">
        <div class="flex items-start gap-3 border-b border-hull p-5">
          <span class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-beacon/10 ring-1 ring-beacon/20">
            <UIcon :name="module.icon" class="size-6 text-beacon" />
          </span>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="font-display text-base font-semibold text-foam">{{ module.name }}</h2>
              <UBadge :color="statusColor(module.status)" variant="subtle" size="sm" class="capitalize" :label="module.status" />
            </div>
            <p class="mt-1 text-sm text-muted">{{ module.description }}</p>
          </div>
        </div>

        <div class="space-y-4 p-5">
          <dl class="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt class="text-xs uppercase tracking-wide text-faint">Database</dt>
              <dd class="mt-1 font-mono text-foam">{{ module.database?.database || module.defaultDatabase }}</dd>
            </div>
            <div>
              <dt class="text-xs uppercase tracking-wide text-faint">Host placement</dt>
              <dd class="mt-1 text-foam">{{ module.database?.mode === 'custom-host' ? 'Separate host' : 'Portal PostgreSQL host' }}</dd>
            </div>
            <div>
              <dt class="text-xs uppercase tracking-wide text-faint">First initialized</dt>
              <dd class="mt-1 text-foam">{{ fmtDate(module.initializedAt) }}</dd>
            </div>
            <div>
              <dt class="text-xs uppercase tracking-wide text-faint">Data policy</dt>
              <dd class="mt-1 text-foam">Dedicated and retained</dd>
            </div>
          </dl>

          <p v-if="module.lastError" class="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-400">
            {{ module.lastError }}
          </p>

          <div class="flex justify-end gap-2">
            <UButton
              v-if="module.enabled"
              variant="soft"
              color="error"
              icon="i-lucide-power-off"
              :disabled="module.status === 'initializing'"
              @click="askDisable(module)"
            >
              Disable
            </UButton>
            <UButton
              v-else
              icon="i-lucide-power"
              :disabled="module.status === 'initializing'"
              @click="configure(module)"
            >
              {{ module.initializedAt ? 'Re-enable' : 'Enable & initialize' }}
            </UButton>
          </div>
        </div>
      </section>
    </div>

    <ModuleSetupWizard
      v-model:open="setupOpen"
      :modules="modules"
      :initial-key="setupKey"
      @complete="fetchModules(true)"
    />

    <UModal v-model:open="disableOpen" title="Disable module">
      <template #body>
        <div class="flex items-start gap-3">
          <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-5 shrink-0 text-amber-400" />
          <p class="text-sm text-muted">
            Disable <strong class="text-foam">{{ disableTarget?.name }}</strong>? Users and background jobs will lose access immediately.
            Its dedicated database, configuration, and all module data will remain intact for a later re-enable or restore.
          </p>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" :disabled="disabling" @click="disableOpen = false">Cancel</UButton>
          <UButton color="error" icon="i-lucide-power-off" :loading="disabling" @click="disableModule">Disable module</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
