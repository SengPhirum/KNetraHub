<script setup lang="ts">
import type { AppKey } from '../../shared/utils/entitlements'

// Reusable shell for an app's own administrator settings. Each app (Network,
// Server, IP Management, ...) gets its own settings page following the Dock
// app's pattern (app/pages/docker/settings.vue). For apps whose admin features
// aren't built yet, this renders the same tab layout with placeholder panels,
// so the structure is in place and real settings (e.g. Alerts channels/rules)
// can drop into a tab once implemented.
const props = defineProps<{
  appName: string
  appKey: AppKey
  backTo: string
}>()

const tabs = [
  { label: 'Alerts', icon: 'i-lucide-bell', slot: 'alerts' as const }
]
</script>

<template>
  <div>
    <PageHeader :title="`${props.appName} settings`" :subtitle="`Administrator settings for the ${props.appName} app`" icon="i-lucide-settings">
      <template #actions>
        <UButton icon="i-lucide-arrow-left" color="neutral" variant="soft" :label="`Back to ${props.appName}`" :to="props.backTo" />
      </template>
    </PageHeader>

    <UTabs :items="tabs" variant="link" class="max-w-5xl" :unmount-on-hide="false">
      <template #alerts>
        <div class="pt-4">
          <section class="panel flex flex-col items-center gap-3 p-10 text-center">
            <UIcon name="i-lucide-bell-off" class="size-7 text-faint" />
            <div>
              <h3 class="font-display text-sm font-semibold text-foam">Alerts not configured yet</h3>
              <p class="mt-1 max-w-md text-xs text-(--color-muted)">
                Notification channels and alert rules for the {{ props.appName }} app will be configured
                here once its alerting is implemented, following the Dock app's Alerts settings.
              </p>
            </div>
            <UBadge color="neutral" variant="subtle" label="Coming soon" />
          </section>
        </div>
      </template>
    </UTabs>
  </div>
</template>
