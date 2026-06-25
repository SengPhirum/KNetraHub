<script setup lang="ts">
// Preferences > Account > Notifications. Per-account notification preferences,
// persisted with the rest of the user's preferences (user_preferences.data).
// These are personal toggles for which events you want to hear about; team-wide
// alert *delivery* is still configured per app (e.g. Dock > Settings > Alerts).
const { prefs, fetchPreferences, updatePreferences } = usePreferences()
const toast = useToast()

const local = reactive({ ...prefs.value.notifications })
watch(() => prefs.value.notifications, (v) => Object.assign(local, v), { immediate: true })

const items: { key: keyof typeof local; label: string; description: string; icon: string }[] = [
  { key: 'deployFailures',   label: 'Deploy failures',     description: 'A stack deploy, rollback, redeploy, image update, or scale fails.', icon: 'i-lucide-circle-x' },
  { key: 'nodeDown',         label: 'Node down',           description: 'A swarm node stops reporting heartbeats.',                         icon: 'i-lucide-server-off' },
  { key: 'replicasDegraded', label: 'Replicas degraded',   description: 'A service stays under its desired replica count.',                 icon: 'i-lucide-trending-down' },
  { key: 'diskUsage',        label: 'Disk usage threshold', description: 'A node crosses its configured disk-usage threshold.',             icon: 'i-lucide-hard-drive' },
  { key: 'newLogin',         label: 'New sign-in',         description: 'A new sign-in to your account (see Login activity).',              icon: 'i-lucide-log-in' }
]

const saving = ref(false)
async function save() {
  saving.value = true
  try {
    await updatePreferences({ notifications: { ...local } })
    toast.add({ title: 'Notification preferences saved', color: 'primary', icon: 'i-lucide-check' })
  } catch (e: any) {
    toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    saving.value = false
  }
}

await fetchPreferences()
</script>

<template>
  <div>
    <PageHeader title="Notifications" subtitle="Choose which events you want to be notified about" icon="i-lucide-bell" />

    <div class="panel p-5 max-w-2xl">
      <div class="divide-y divide-hull">
        <div v-for="item in items" :key="item.key" class="flex items-center gap-3 py-3.5">
          <UIcon :name="item.icon" class="size-4 shrink-0 text-beacon" />
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-foam">{{ item.label }}</p>
            <p class="text-xs text-(--color-muted)">{{ item.description }}</p>
          </div>
          <USwitch v-model="local[item.key]" color="primary" />
        </div>
      </div>

      <div class="flex justify-end border-t border-hull pt-4 mt-1">
        <UButton color="primary" label="Save preferences" icon="i-lucide-check" :loading="saving" @click="save" />
      </div>
    </div>
  </div>
</template>
