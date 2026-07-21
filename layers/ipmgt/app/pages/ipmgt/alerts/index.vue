<script setup lang="ts">
// IP Management alert rules — what triggers an IPAM alert and the message sent
// to every delivery channel. Mirrors the Dock app's Alerts section. Threshold
// rules (subnet utilization/full) are polled; the request rule fires inline.
// Delivery transports live on the sibling /ipmgt/alerts/transports page.
definePageMeta({
  middleware: [
    function () {
      const { hasPermission } = useAuth()
      if (!hasPermission('ipmgt.settings')) return navigateTo('/ipmgt')
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
const { data: rules, refresh: refreshRules } = useFetch<AlertRule[]>('/api/ipmgt/alerts/rules', { lazy: true, default: () => [] })

// Vue closes a mustache at the first "}}" even inside a JS string, so a literal
// "{{x}}" placeholder chip is built here rather than inline in the template.
function placeholderChip(name: string) {
  return '{' + '{' + name + '}' + '}'
}

const RULE_LABELS: Record<string, { label: string; icon: string; hint?: string }> = {
  subnet_utilization: { label: 'Subnet utilization', icon: 'i-lucide-gauge', hint: 'Fires when a subnet crosses the configured percentage of its usable capacity.' },
  subnet_full: { label: 'Subnet full', icon: 'i-lucide-battery-warning', hint: 'Fires when a subnet has 0 free addresses left — new allocations will fail.' },
  ip_request_submitted: { label: 'IP request submitted', icon: 'i-lucide-inbox', hint: 'Fires when a user submits a new IP request awaiting manager review.' }
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
    await $fetch(`/api/ipmgt/alerts/rules/${type}`, { method: 'PUT', body: { enabled: edit.enabled, config: edit.config, template: edit.template } })
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
    await $fetch(`/api/ipmgt/alerts/rules/${type}/reset`, { method: 'POST' })
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
    <PageHeader title="Alert rules" subtitle="What triggers an IP Management alert and the message sent to every transport" icon="i-lucide-bell-ring">
      <template #actions>
        <div class="flex gap-2">
          <UButton size="sm" variant="soft" icon="i-lucide-send" label="Alert Transports" to="/ipmgt/alerts/transports" />
          <UButton size="sm" color="neutral" variant="soft" icon="i-lucide-arrow-left" label="Back to IP Mgt" to="/ipmgt" />
        </div>
      </template>
    </PageHeader>

    <section class="panel p-5 max-w-5xl">
      <p class="mb-4 text-xs text-(--color-muted)">Toggle what triggers an alert, tune thresholds, and customize the message sent to every delivery transport.</p>

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
            <div v-if="rule.type === 'subnet_utilization'" class="mb-3">
              <UFormField label="Utilization threshold (%)">
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
