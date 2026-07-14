<script setup lang="ts">
// Admin > Security > App & Access. Maps Keycloak realm roles to per-app access
// tiers (viewer/operator/manager/admin). Stored in the DB; the local admin is always a
// superuser regardless. Was the "Apps & Access" tab in the old /settings.
import { APP_PERMISSIONS } from '~~/shared/utils/permissions'

definePageMeta({ middleware: 'admin' })

const toast = useToast()

const APP_TIERS = ['viewer', 'operator', 'manager', 'admin'] as const
const TIER_DESCRIPTIONS: Record<typeof APP_TIERS[number], string> = {
  viewer: 'Read-only',
  operator: 'Day-to-day actions',
  manager: 'Approval & oversight, no system config',
  admin: 'Full control'
}

// Friendly labels for the raw permission tokens in shared/utils/permissions.ts,
// so this page can show an admin exactly what each tier grants instead of a
// generic one-line description reused for every app.
const PERMISSION_LABELS: Record<string, string> = {
  'docker.view': 'View services, stacks, and nodes',
  'docker.manage': 'Scale and redeploy services',
  'docker.deploy': 'Deploy new stacks',
  'docker.audit': 'View the Docker audit trail',
  'docker.registry.manage': 'Manage registry credentials',
  'monitoring.view': 'View devices and hosts',
  'monitoring.manage': 'Full device/host management',
  'monitoring.scan': 'Run discovery scans',
  'monitoring.configure': 'Change module settings',
  'monitoring.metrics': 'View metrics and sensors',
  'monitoring.service.manage': 'Manage monitored services',
  'monitoring.alert': 'Manage alert rules',
  'ipmgt.view': 'View address space',
  'ipmgt.create': 'Create subnets, addresses, and more',
  'ipmgt.update': 'Edit subnets, addresses, and more',
  'ipmgt.delete': 'Delete subnets, addresses, and more',
  'ipmgt.assign': 'Reserve and assign addresses',
  'ipmgt.export': 'Export data',
  'ipmgt.import': 'Import data',
  'ipmgt.scan': 'Run subnet scans',
  'ipmgt.request': 'Submit IP requests',
  'ipmgt.approve': 'Approve or reject IP requests',
  'ipmgt.settings': 'Change module settings'
}
function permLabel(p: string): string { return PERMISSION_LABELS[p] || p }

/** What a tier adds on top of the tier below it (the raw per-tier arrays in
 *  APP_PERMISSIONS are already incremental, not cumulative). */
function tierGrantLabels(appKey: string, tier: typeof APP_TIERS[number]): string[] {
  const set = (APP_PERMISSIONS as Record<string, Record<string, string[]>>)[appKey]
  return (set?.[tier] || []).map(permLabel)
}
/** Everything a tier grants, including every lower tier (viewer..tier). */
function cumulativeGrantLabels(appKey: string, tier: typeof APP_TIERS[number]): string[] {
  const order = APP_TIERS.slice(0, APP_TIERS.indexOf(tier) + 1)
  return order.flatMap((t) => tierGrantLabels(appKey, t))
}
function tierFieldDescription(appKey: string, tier: typeof APP_TIERS[number]): string {
  const added = tierGrantLabels(appKey, tier)
  if (!added.length) return `${TIER_DESCRIPTIONS[tier]} - adds nothing beyond the tier below (see "What each tier grants" above).`
  return `${TIER_DESCRIPTIONS[tier]} - adds: ${added.join(', ')}.`
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

// Two role-source conventions Keycloak supports; the template + guidance
// adapt to whichever the admin picks. See the "Realm roles claim" field on
// the Authentication page - it must match this choice.
type RoleSource = 'realm' | 'client'
const roleSource = ref<RoleSource>('realm')
const { data: auth } = useFetch<{ oidc: { clientId: string, rolesClaim: string } }>('/api/auth/settings', { lazy: true })
const suggestedRolesClaim = computed(() =>
  roleSource.value === 'realm' ? 'realm_access.roles' : `resource_access.${auth.value?.oidc.clientId || '<client-id>'}.roles`
)

// Recommended role-naming convention. Realm roles need a KNetraHub-specific
// prefix since they're visible realm-wide and could otherwise collide with
// another app's roles; client roles are already scoped to this OIDC client,
// so a short name is enough. The slug usually matches the app key, except
// Monitoring - its realm roles predate the Network+Server merge and still
// use the original "network" naming.
const TEMPLATE_SLUG: Record<string, string> = { monitoring: 'network' }
function applyRecommendedTemplate() {
  for (const app of accessApps) {
    const slug = TEMPLATE_SLUG[app.key] || app.key
    accessForm[app.key] = accessForm[app.key] || {}
    for (const tier of APP_TIERS) {
      accessForm[app.key]![tier] = roleSource.value === 'realm' ? `role.knetrahub_${slug}.${tier}` : `${slug}-${tier}`
    }
  }
  toast.add({ title: 'Recommended template applied', description: `Using ${roleSource.value === 'realm' ? 'realm roles' : 'client roles'} naming. Review the values below, then save to persist.`, color: 'primary', icon: 'i-lucide-wand-2' })
}

async function copySuggestedClaim() {
  await navigator.clipboard.writeText(suggestedRolesClaim.value)
  toast.add({ title: 'Copied', description: suggestedRolesClaim.value, color: 'primary', icon: 'i-lucide-check' })
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

    <section class="panel mb-5 p-5">
      <h3 class="mb-1 font-display text-sm font-semibold text-foam flex items-center gap-2">
        <UIcon name="i-lucide-compass" class="size-4 text-beacon" />
        Role source guide
      </h3>
      <p class="mb-3 text-xs text-(--color-muted)">
        Keycloak (and most OIDC providers) can hand out two different kinds of role: <strong class="text-foam">realm roles</strong>, visible
        to every client in the realm, or <strong class="text-foam">client roles</strong>, scoped to just one client. Pick whichever matches
        how your identity provider is set up - it changes the recommended template below and what the Authentication page's
        "Realm roles claim" field should be set to.
      </p>

      <div class="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          class="rounded-lg border p-3 text-left transition"
          :class="roleSource === 'realm' ? 'border-beacon bg-beacon/10' : 'border-hull-soft bg-surface-2/40 hover:border-hull'"
          @click="roleSource = 'realm'"
        >
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-globe" class="size-4 shrink-0" :class="roleSource === 'realm' ? 'text-beacon' : 'text-faint'" />
            <p class="text-sm font-semibold text-foam">1. Realm roles</p>
          </div>
          <p class="mt-1.5 text-xs text-(--color-muted)">
            Created under Keycloak → <span class="font-mono">Realm roles</span>. Visible to every client in the realm, so names need a
            KNetraHub-specific prefix to avoid colliding with another app's roles - the template uses
            <span class="font-mono text-beacon">role.knetrahub_&lt;app&gt;.&lt;tier&gt;</span>. Good default when one Keycloak realm serves
            multiple applications.
          </p>
        </button>
        <button
          type="button"
          class="rounded-lg border p-3 text-left transition"
          :class="roleSource === 'client' ? 'border-beacon bg-beacon/10' : 'border-hull-soft bg-surface-2/40 hover:border-hull'"
          @click="roleSource = 'client'"
        >
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-box" class="size-4 shrink-0" :class="roleSource === 'client' ? 'text-beacon' : 'text-faint'" />
            <p class="text-sm font-semibold text-foam">2. Client role config</p>
          </div>
          <p class="mt-1.5 text-xs text-(--color-muted)">
            Created under Keycloak → <span class="font-mono">Clients → (your OIDC client) → Roles</span>. Already scoped to just this
            client, so short names are fine - the template uses <span class="font-mono text-beacon">&lt;app&gt;-&lt;tier&gt;</span>.
            Good default when you'd rather keep KNetraHub's roles out of the realm-wide role list entirely.
          </p>
        </button>
      </div>

      <div class="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-surface-2/60 p-3 text-xs">
        <UIcon name="i-lucide-info" class="size-3.5 shrink-0 text-beacon" />
        <span class="text-(--color-muted)">Set the Authentication page's <strong class="text-foam">Realm roles claim</strong> field to:</span>
        <code class="font-mono text-beacon">{{ suggestedRolesClaim }}</code>
        <UButton size="xs" variant="ghost" icon="i-lucide-copy" aria-label="Copy" @click="copySuggestedClaim" />
        <NuxtLink to="/admin/authentication" class="ml-auto text-beacon hover:underline">Open Authentication →</NuxtLink>
      </div>
    </section>

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
          Map your Keycloak {{ roleSource === 'realm' ? 'realm roles' : 'client roles' }} (the
          <code class="font-mono text-beacon">{{ suggestedRolesClaim }}</code>
          claim) to each app and tier. A user gets the highest tier whose role list
          matches one of their roles; with no match, the app is hidden. Separate
          multiple roles with commas. The local admin always sees every app regardless of this map.
        </p>
      </header>

      <div class="grid gap-4 lg:grid-cols-2">
        <div v-for="app in accessApps" :key="app.key" class="rounded-lg border border-hull-soft bg-surface-2/40 p-4">
          <div class="mb-3 flex items-center gap-2">
            <UIcon :name="app.icon" class="size-4 text-beacon" />
            <p class="text-sm font-semibold text-foam">{{ app.name }}</p>
            <UBadge color="neutral" variant="subtle" size="sm" :label="app.type === 'local' ? 'Built in' : 'Subsystem'" class="ml-auto" />
            <UPopover :content="{ align: 'end', sideOffset: 8 }">
              <UButton size="xs" variant="ghost" icon="i-lucide-list-checks" label="What each tier grants" />
              <template #content>
                <div class="w-80 max-w-[calc(100vw-2rem)] p-4">
                  <p class="mb-2 text-xs font-semibold uppercase text-faint">{{ app.name }} - cumulative permissions</p>
                  <div v-for="tier in APP_TIERS" :key="tier" class="mb-2.5 last:mb-0">
                    <p class="text-xs font-medium text-foam capitalize">{{ tier }}</p>
                    <ul v-if="cumulativeGrantLabels(app.key, tier).length" class="mt-0.5 list-disc space-y-0.5 pl-4 text-xs text-(--color-muted)">
                      <li v-for="label in cumulativeGrantLabels(app.key, tier)" :key="label">{{ label }}</li>
                    </ul>
                    <p v-else class="mt-0.5 text-xs text-faint">No access.</p>
                  </div>
                  <p v-if="app.key === 'docker'" class="mt-2 border-t border-hull pt-2 text-xs text-amber-400">
                    Note: Docker's Admin tier grants nothing beyond Manager - every Docker permission that exists is already covered at Manager.
                  </p>
                </div>
              </template>
            </UPopover>
          </div>
          <div v-if="accessForm[app.key]" class="space-y-3">
            <UFormField
              v-for="tier in APP_TIERS"
              :key="tier"
              :label="tier.charAt(0).toUpperCase() + tier.slice(1)"
              :description="tierFieldDescription(app.key, tier)"
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
