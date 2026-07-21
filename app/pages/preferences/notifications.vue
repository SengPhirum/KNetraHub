<script setup lang="ts">
import type { NotificationPreferences } from '~/composables/usePreferences'

// Personal browser/toast delivery preferences. Team-wide alert generation and
// external channels remain under the Dock app's Alerts > Channels.
const { prefs, fetchPreferences, updatePreferences } = usePreferences()
const toast = useToast()

const local = reactive<NotificationPreferences>({ ...prefs.value.notifications })
watch(() => prefs.value.notifications, (value) => Object.assign(local, value), { immediate: true })

type ToggleKey = Exclude<keyof NotificationPreferences, 'delivery'>
interface ToggleItem { key: ToggleKey; label: string; description: string; icon: string; critical?: boolean }

const tabs = [
  { label: 'Alerts', value: 'alerts', slot: 'alerts', icon: 'i-lucide-triangle-alert' },
  { label: 'Actions', value: 'actions', slot: 'actions', icon: 'i-lucide-mouse-pointer-click' },
  { label: 'Security', value: 'security', slot: 'security', icon: 'i-lucide-shield-check' }
]

const alertItems: ToggleItem[] = [
  { key: 'criticalAlerts', label: 'Critical alerts', description: 'Deploy failures, unavailable nodes, and other critical Docker alerts.', icon: 'i-lucide-circle-x', critical: true },
  { key: 'warningAlerts', label: 'Warning alerts', description: 'Usage thresholds, degraded replicas, and other warning conditions.', icon: 'i-lucide-triangle-alert' },
  { key: 'infoAlerts', label: 'Informational alerts', description: 'Successful deploys, recovery events, scaling, and other informational alerts.', icon: 'i-lucide-info' }
]

const actionItems: ToggleItem[] = [
  { key: 'actionStarted', label: 'Action started', description: 'Notify when an operation begins, for example "api is redeploying".', icon: 'i-lucide-loader-circle' },
  { key: 'actionSucceeded', label: 'Action completed', description: 'Notify when any state-changing action finishes successfully.', icon: 'i-lucide-circle-check' },
  { key: 'actionFailed', label: 'Action failed', description: 'Notify when any state-changing action is rejected or fails.', icon: 'i-lucide-circle-x' }
]

const securityItems: ToggleItem[] = [
  { key: 'newLogin', label: 'New sign-in', description: 'Notify when your account signs in (also recorded in Login activity).', icon: 'i-lucide-log-in' }
]

function setAll(items: ToggleItem[], enabled: boolean) {
  for (const item of items) local[item.key] = enabled
}

const saving = ref(false)
async function save() {
  saving.value = true
  try {
    if (local.delivery === 'browser' && import.meta.client && 'Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission()
    }
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
    <PageHeader title="Notifications" subtitle="Choose which alerts and action updates reach you" icon="i-lucide-bell" />

    <div class="panel max-w-3xl p-5">
      <div class="mb-4 border-b border-hull pb-4">
        <div class="flex items-center gap-2">
          <p class="text-sm font-medium text-foam">Delivery method</p>
          <UBadge color="error" variant="subtle" size="sm" label="Critical only by default" />
        </div>
        <p class="mb-3 mt-1 text-xs text-(--color-muted)">Browser notifications are requested automatically. When permission is denied or unavailable, every enabled event falls back to an in-app toast.</p>
        <USelect
          v-model="local.delivery"
          :items="[
            { label: 'Browser notification (recommended)', value: 'browser' },
            { label: 'In-app toast only', value: 'toast' }
          ]"
          value-key="value"
          label-key="label"
          class="w-full sm:w-80"
        />
      </div>

      <UTabs :items="tabs" variant="link" :unmount-on-hide="false">
        <template #alerts>
          <div class="pt-3">
            <div class="mb-1 flex items-center justify-end gap-1">
              <UButton size="xs" color="neutral" variant="ghost" label="Enable all" @click="setAll(alertItems, true)" />
              <UButton size="xs" color="neutral" variant="ghost" label="Disable all" @click="setAll(alertItems, false)" />
            </div>
            <div class="divide-y divide-hull">
              <div v-for="item in alertItems" :key="item.key" class="flex items-center gap-3 py-3.5">
                <UIcon :name="item.icon" class="size-4 shrink-0" :class="item.critical ? 'text-(--color-down-ink)' : 'text-beacon'" />
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-medium text-foam">{{ item.label }}</p>
                  <p class="text-xs text-(--color-muted)">{{ item.description }}</p>
                </div>
                <USwitch v-model="local[item.key]" color="primary" />
              </div>
            </div>
          </div>
        </template>

        <template #actions>
          <div class="pt-3">
            <div class="mb-1 flex items-center justify-between gap-3">
              <p class="text-xs text-(--color-muted)">Covers every authenticated POST, PUT, PATCH, and DELETE action across enabled modules.</p>
              <div class="flex shrink-0 items-center gap-1">
                <UButton size="xs" color="neutral" variant="ghost" label="Enable all" @click="setAll(actionItems, true)" />
                <UButton size="xs" color="neutral" variant="ghost" label="Disable all" @click="setAll(actionItems, false)" />
              </div>
            </div>
            <div class="divide-y divide-hull">
              <div v-for="item in actionItems" :key="item.key" class="flex items-center gap-3 py-3.5">
                <UIcon :name="item.icon" class="size-4 shrink-0 text-beacon" />
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-medium text-foam">{{ item.label }}</p>
                  <p class="text-xs text-(--color-muted)">{{ item.description }}</p>
                </div>
                <USwitch v-model="local[item.key]" color="primary" />
              </div>
            </div>
          </div>
        </template>

        <template #security>
          <div class="divide-y divide-hull pt-3">
            <div v-for="item in securityItems" :key="item.key" class="flex items-center gap-3 py-3.5">
              <UIcon :name="item.icon" class="size-4 shrink-0 text-beacon" />
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium text-foam">{{ item.label }}</p>
                <p class="text-xs text-(--color-muted)">{{ item.description }}</p>
              </div>
              <USwitch v-model="local[item.key]" color="primary" />
            </div>
          </div>
        </template>
      </UTabs>

      <div class="mt-1 flex justify-end border-t border-hull pt-4">
        <UButton color="primary" label="Save preferences" icon="i-lucide-check" :loading="saving" @click="save" />
      </div>
    </div>
  </div>
</template>
