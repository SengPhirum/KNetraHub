<script setup lang="ts">
// Admin > Security > App & Access. Maps Keycloak realm roles to per-app access
// tiers (viewer/operator/manager/admin). Stored in the DB; the local admin is always a
// superuser regardless. Was the "Apps & Access" tab in the old /settings.
definePageMeta({ middleware: 'admin' })

const toast = useToast()

const APP_TIERS = ['viewer', 'operator', 'manager', 'admin'] as const
const TIER_DESCRIPTIONS: Record<typeof APP_TIERS[number], string> = {
  viewer: 'Read-only',
  operator: 'Day-to-day actions',
  manager: 'Approval & oversight, no system config',
  admin: 'Full control'
}
const accessApps = getModuleRegistry()
type RoleMap = Record<string, Record<string, string[]>>
const { data: appRoleMap, refresh: refreshAppRoles } = useFetch<RoleMap>('/api/settings/app-roles', { lazy: true })
// Editable comma/newline-separated role names per app+tier.
const accessForm = reactive<Record<string, Record<string, string>>>({})
const savingAccess = ref(false)

watch(appRoleMap, (value) => {
  for (const app of accessApps) {
    accessForm[app.key] = accessForm[app.key] || {}
    for (const tier of APP_TIERS) {
      accessForm[app.key]![tier] = (value?.[app.key]?.[tier] || []).join(', ')
    }
  }
}, { immediate: true })

function parseRoles(s: string): string[] {
  return [...new Set(s.split(/[,\n]/).map((r) => r.trim()).filter(Boolean))]
}

// Recommended role-naming convention: role.knetrahub_<slug>.<tier>. The slug
// usually matches the app key, except Monitoring - its realm roles predate the
// Network+Server merge and still use the original "network" naming.
const TEMPLATE_SLUG: Record<string, string> = { monitoring: 'network' }
function applyRecommendedTemplate() {
  for (const app of accessApps) {
    const slug = TEMPLATE_SLUG[app.key] || app.key
    accessForm[app.key] = accessForm[app.key] || {}
    for (const tier of APP_TIERS) accessForm[app.key]![tier] = `role.knetrahub_${slug}.${tier}`
  }
  toast.add({ title: 'Recommended template applied', description: 'Review the values below, then save to persist.', color: 'primary', icon: 'i-lucide-wand-2' })
}

async function saveAccess() {
  savingAccess.value = true
  try {
    const map: RoleMap = {}
    for (const app of accessApps) {
      map[app.key] = {}
      for (const tier of APP_TIERS) map[app.key]![tier] = parseRoles(accessForm[app.key]?.[tier] || '')
    }
    await $fetch('/api/settings/app-roles', { method: 'PUT', body: map })
    toast.add({ title: 'Access map saved', color: 'primary', icon: 'i-lucide-check' })
    await refreshAppRoles()
  } catch (e: any) {
    toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    savingAccess.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader title="App & Access" subtitle="Map identity-provider roles to per-app access tiers" icon="i-lucide-layout-grid" />

    <section class="panel p-5">
      <header class="mb-2 flex flex-col gap-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="font-display text-sm font-semibold text-foam flex items-center gap-2">
            <UIcon name="i-lucide-layout-grid" class="size-4 text-beacon" />
            App access by identity-provider role
          </h3>
          <UButton
            size="xs"
            color="neutral"
            variant="soft"
            icon="i-lucide-wand-2"
            label="Use recommended template"
            @click="applyRecommendedTemplate"
          />
        </div>
        <p class="text-xs text-(--color-muted)">
          Map your Keycloak realm roles (the <code class="font-mono text-beacon">realm_access.roles</code>
          claim) to each app and tier. A user gets the highest tier whose role list
          matches one of their realm roles; with no match, the app is hidden. Separate
          multiple roles with commas. The local admin always sees every app.
        </p>
      </header>

      <div class="grid gap-4 lg:grid-cols-2">
        <div v-for="app in accessApps" :key="app.key" class="rounded-lg border border-hull-soft bg-surface-2/40 p-4">
          <div class="mb-3 flex items-center gap-2">
            <UIcon :name="app.icon" class="size-4 text-beacon" />
            <p class="text-sm font-semibold text-foam">{{ app.name }}</p>
            <UBadge color="neutral" variant="subtle" size="sm" :label="app.type === 'local' ? 'Built in' : 'Subsystem'" class="ml-auto" />
          </div>
          <div v-if="accessForm[app.key]" class="space-y-3">
            <UFormField
              v-for="tier in APP_TIERS"
              :key="tier"
              :label="tier.charAt(0).toUpperCase() + tier.slice(1)"
              :description="TIER_DESCRIPTIONS[tier]"
            >
              <UInput
                v-model="accessForm[app.key]![tier]"
                class="w-full font-mono text-xs"
                placeholder="e.g. team-ops, sre"
              />
            </UFormField>
          </div>
        </div>
      </div>

      <footer class="mt-4 flex justify-end border-t border-hull pt-4">
        <UButton color="primary" label="Save access map" icon="i-lucide-save" :loading="savingAccess" @click="saveAccess" />
      </footer>
    </section>
  </div>
</template>
