<script setup lang="ts">
// Portal alert rules — the admin portal's own alert engine, the peer of the
// per-app Alerts sections in Dock, Monitoring and IP Mgt. Covers portal-level
// security/system events rather than any one sub-app. Delivery goes to the
// portal's own channels (the Global channels under Notifications > Channels).
definePageMeta({ middleware: 'admin' })

interface AlertRule {
  type: string
  enabled: boolean
  config: Record<string, any>
  template: string
  placeholders: string[]
}

const toast = useToast()
const { data: rules, refresh: refreshRules } = useFetch<AlertRule[]>('/api/admin/alerts/rules', { lazy: true, default: () => [] })

// Vue closes a mustache at the first "}}" even inside a JS string, so a literal
// "{{x}}" placeholder chip is built here rather than inline in the template.
function placeholderChip(name: string) {
  return '{' + '{' + name + '}' + '}'
}

const RULE_LABELS: Record<string, { label: string; icon: string; hint?: string }> = {
  login_failed: { label: 'Repeated failed sign-ins', icon: 'i-lucide-shield-alert', hint: 'Fires once an account reaches the configured number of consecutive failures, then stays quiet until it signs in successfully.' },
  admin_login: { label: 'Portal admin signed in', icon: 'i-lucide-log-in', hint: 'Visibility on privileged sign-ins. Off by default — on a busy portal this is noisy.' },
  user_role_changed: { label: 'Portal role changed', icon: 'i-lucide-shield-half', hint: 'Fires when a user’s portal role changes — including a promotion to admin.' },
  user_deleted: { label: 'Portal user deleted', icon: 'i-lucide-user-minus', hint: 'Fires when an admin deletes a portal user account.' },
  module_load_failed: { label: 'Subsystem failed to load', icon: 'i-lucide-unplug', hint: 'Fires when a remote sub-app UI fails to load for a signed-in user.' },
  backup_failed: { label: 'Backup / restore failed', icon: 'i-lucide-database-backup', hint: 'Fires on any failed backup, restore, or backup-delete operation.' }
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
    await $fetch(`/api/admin/alerts/rules/${type}`, { method: 'PUT', body: { enabled: edit.enabled, config: edit.config, template: edit.template } })
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
    await $fetch(`/api/admin/alerts/rules/${type}/reset`, { method: 'POST' })
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
    <PageHeader title="Portal alert rules" subtitle="Security and system alerts for the portal itself — delivered to your Global channels" icon="i-lucide-bell-ring">
      <template #actions>
        <UButton size="sm" variant="soft" icon="i-lucide-satellite-dish" label="Channels" to="/admin/notifications/channels" />
      </template>
    </PageHeader>

    <section class="panel p-5 max-w-5xl">
      <p class="mb-4 text-xs text-(--color-muted)">
        These are the portal's own alerts — sign-in and privilege changes, subsystem and backup failures — separate from each sub-app's rules.
        They deliver to every enabled <NuxtLink to="/admin/notifications/channels" class="text-beacon hover:underline">Global channel</NuxtLink>.
      </p>

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
            <div v-if="rule.type === 'login_failed'" class="mb-3">
              <UFormField label="Consecutive failures before alerting">
                <UInput v-model.number="ruleEdits[rule.type]!.config.threshold" type="number" min="1" max="100" class="w-40" />
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
