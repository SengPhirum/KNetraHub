<script setup lang="ts">
// Docker Swarm alert rules — what triggers an alert, threshold tuning, and the
// message sent to every delivery channel. Promoted out of Dock settings into
// its own "Alerts" sidebar section (mirrors the Monitoring module's Alerts
// menu). Delivery channels live on the sibling /docker/alerts/channels page.
// Gated by the per-app docker admin tier (same boundary /api/alerts/* enforces).
definePageMeta({
  middleware: [
    function () {
      const { hasPermission } = useAuth()
      if (!hasPermission('docker.manage')) return navigateTo('/docker')
    }
  ]
})

interface AlertRule {
  type: string
  enabled: boolean
  config: Record<string, any>
  template: string
  placeholders: string[]
}

const toast = useToast()
const { data: rules, refresh: refreshRules } = useFetch<AlertRule[]>('/api/alerts/rules', { lazy: true, default: () => [] })

// Vue's template parser closes a mustache interpolation at the first "}}"
// it sees, even inside a JS string - a literal "{{x}}" placeholder chip
// can't be built inline in the template, so it's built here instead.
function placeholderChip(name: string) {
  return '{' + '{' + name + '}' + '}'
}

const RULE_LABELS: Record<string, { label: string; icon: string; hint?: string }> = {
  deploy_failed: { label: 'Deploy failed', icon: 'i-lucide-circle-x' },
  usage_threshold: { label: 'Usage threshold', icon: 'i-lucide-gauge' },
  node_down: { label: 'Node down', icon: 'i-lucide-server-off' },
  replicas_degraded: { label: 'Replicas degraded', icon: 'i-lucide-trending-down' },
  disk_usage_threshold: { label: 'Disk usage threshold', icon: 'i-lucide-hard-drive' },
  stack_deployed: { label: 'Stack deployed / updated', icon: 'i-lucide-rocket', hint: 'Fires on every successful stack deploy, update or rollback.' },
  stack_removed: { label: 'Stack removed', icon: 'i-lucide-layers', hint: 'Fires when a stack and its services are removed.' },
  service_down: { label: 'Service down', icon: 'i-lucide-power-off', hint: '0 running replicas while some are desired.' },
  service_recovered: { label: 'Service recovered', icon: 'i-lucide-heart-pulse', hint: 'Fires when a previously-down service is running again.' },
  service_redeployed: { label: 'Service redeployed', icon: 'i-lucide-refresh-cw', hint: 'Manual redeploys and automatic image-digest redeploys.' },
  service_scaled: { label: 'Service scaled', icon: 'i-lucide-scaling', hint: 'Fires when a service replica count is changed.' },
  service_image_updated: { label: 'Service image updated', icon: 'i-lucide-container', hint: 'Fires when a service is switched to a different image.' },
  task_failed: { label: 'Task failed', icon: 'i-lucide-octagon-alert', hint: 'A task entered the failed or rejected state.' },
  task_shutdown: { label: 'Task shutdown', icon: 'i-lucide-square-power', hint: 'A task was shut down. Noisy: every redeploy/scale-down shuts tasks down.' }
}

const ruleEdits = reactive<Record<string, { enabled: boolean; config: Record<string, any>; template: string; templateOpen: boolean }>>({})
watch(rules, (list) => {
  if (!list) return
  for (const r of list) {
    ruleEdits[r.type] = { enabled: r.enabled, config: { ...r.config }, template: r.template, templateOpen: ruleEdits[r.type]?.templateOpen ?? false }
  }
}, { immediate: true })

const savingRule = ref<string | null>(null)
const resettingRule = ref<string | null>(null)

async function saveRule(type: string) {
  savingRule.value = type
  try {
    const edit = ruleEdits[type]!
    await $fetch(`/api/alerts/rules/${type}`, { method: 'PUT', body: { enabled: edit.enabled, config: edit.config, template: edit.template } })
    toast.add({ title: 'Rule saved', color: 'primary', icon: 'i-lucide-check' })
    await refreshRules()
  } catch (e: any) {
    toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    savingRule.value = null
  }
}

async function resetRule(type: string) {
  if (!confirm('Reset this rule to its default configuration and template?')) return
  resettingRule.value = type
  try {
    await $fetch(`/api/alerts/rules/${type}/reset`, { method: 'POST' })
    toast.add({ title: 'Rule reset to default', color: 'primary', icon: 'i-lucide-rotate-ccw' })
    await refreshRules()
  } catch (e: any) {
    toast.add({ title: 'Reset failed', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    resettingRule.value = null
  }
}
</script>

<template>
  <div>
    <PageHeader title="Alert rules" subtitle="What triggers a Swarm alert, thresholds, and the message sent to every channel" icon="i-lucide-bell-ring">
      <template #actions>
        <div class="flex gap-2">
          <UButton size="sm" variant="soft" icon="i-lucide-satellite-dish" label="Channels" to="/docker/alerts/channels" />
          <UButton size="sm" color="neutral" variant="soft" icon="i-lucide-arrow-left" label="Back to Dock" to="/docker" />
        </div>
      </template>
    </PageHeader>

    <section class="panel p-5 max-w-5xl">
      <p class="mb-4 text-xs text-(--color-muted)">Toggle what triggers an alert, tune thresholds, and customize the message sent to every delivery channel.</p>

      <div class="grid gap-4 lg:grid-cols-2">
        <div v-for="rule in rules" :key="rule.type" class="rounded-lg border border-hull-soft bg-surface-2/40 p-4">
          <div v-if="ruleEdits[rule.type]" class="flex items-center justify-between gap-3 mb-3">
            <div class="flex items-center gap-2">
              <UIcon :name="RULE_LABELS[rule.type]?.icon || 'i-lucide-bell'" class="size-4 text-beacon" />
              <p class="text-sm font-semibold text-foam">{{ RULE_LABELS[rule.type]?.label || rule.type }}</p>
            </div>
            <USwitch v-model="ruleEdits[rule.type]!.enabled" color="primary" />
          </div>

          <template v-if="ruleEdits[rule.type]">
            <p v-if="RULE_LABELS[rule.type]?.hint" class="mb-3 -mt-1 text-xs text-(--color-muted)">{{ RULE_LABELS[rule.type]!.hint }}</p>
            <div v-if="rule.type === 'usage_threshold'" class="mb-3 grid grid-cols-2 gap-3">
              <UFormField label="CPU threshold (%)">
                <UInput v-model.number="ruleEdits[rule.type]!.config.cpuPercent" type="number" min="1" max="100" class="w-full" />
              </UFormField>
              <UFormField label="Memory threshold (%)">
                <UInput v-model.number="ruleEdits[rule.type]!.config.memoryPercent" type="number" min="1" max="100" class="w-full" />
              </UFormField>
            </div>
            <div v-else-if="rule.type === 'replicas_degraded' || rule.type === 'service_down'" class="mb-3">
              <UFormField label="Grace period (minutes)">
                <UInput v-model.number="ruleEdits[rule.type]!.config.gracePeriodMinutes" type="number" min="0" class="w-40" />
              </UFormField>
            </div>
            <div v-else-if="rule.type === 'disk_usage_threshold'" class="mb-3">
              <UFormField label="Disk threshold (%)">
                <UInput v-model.number="ruleEdits[rule.type]!.config.percent" type="number" min="1" max="100" class="w-40" />
              </UFormField>
            </div>

            <button
              type="button"
              class="mb-2 flex items-center gap-1.5 text-xs text-faint transition hover:text-foam"
              @click="ruleEdits[rule.type]!.templateOpen = !ruleEdits[rule.type]!.templateOpen"
            >
              <UIcon :name="ruleEdits[rule.type]!.templateOpen ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-3.5" />
              Customize message
            </button>
            <div v-if="ruleEdits[rule.type]!.templateOpen" class="mb-3 space-y-2">
              <UTextarea v-model="ruleEdits[rule.type]!.template" class="w-full font-mono text-xs" :rows="2" />
              <div class="flex flex-wrap gap-1.5">
                <span v-for="p in rule.placeholders" :key="p" class="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-beacon">{{ placeholderChip(p) }}</span>
              </div>
            </div>
          </template>

          <footer class="flex justify-end gap-2 border-t border-hull pt-3">
            <UButton size="xs" color="neutral" variant="ghost" label="Reset" icon="i-lucide-rotate-ccw" :loading="resettingRule === rule.type" @click="resetRule(rule.type)" />
            <UButton size="xs" color="primary" label="Save" icon="i-lucide-save" :loading="savingRule === rule.type" @click="saveRule(rule.type)" />
          </footer>
        </div>
      </div>
    </section>
  </div>
</template>
