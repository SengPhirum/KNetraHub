<script setup lang="ts">
definePageMeta({
  middleware: [
    function () {
      const { can } = useAuth()
      if (!can('admin')) return navigateTo('/')
    }
  ]
})

interface LdapSettings {
  enabled: boolean
  url: string
  bindDN: string
  bindCredentials: string
  hasBindCredentials: boolean
  searchBase: string
  searchFilter: string
  groupSearchBase: string
  groupSearchFilter: string
  adminGroup: string
  operatorGroup: string
  overridden: boolean
}

interface OidcSettings {
  enabled: boolean
  issuer: string
  clientId: string
  clientSecret: string
  hasClientSecret: boolean
  redirectUri: string
  effectiveRedirectUri: string
  scope: string
  usernameClaim: string
  displayNameClaim: string
  groupsClaim: string
  adminGroup: string
  operatorGroup: string
  providerName: string
  overridden: boolean
}

interface AuthSettingsResponse {
  ldap: LdapSettings
  oidc: OidcSettings
}

const toast = useToast()

const { appearance, overridden: appearanceOverridden, previewAppearance, saveAppearance, resetAppearance, fetchAppearance } = useAppearance()

const { data: gl } = useFetch('/api/gitlab/status', { lazy: true })
const {
  data: auth,
  status: authStatus,
  error: authError,
  refresh: refreshAuth
} = useFetch<AuthSettingsResponse>('/api/auth/settings', { lazy: true })

const tabs = [
  { label: 'Appearance', icon: 'i-lucide-paintbrush', slot: 'appearance' as const },
  { label: 'Integrations', icon: 'i-lucide-plug', slot: 'integrations' as const },
  { label: 'Authentication', icon: 'i-lucide-shield-check', slot: 'authentication' as const },
  { label: 'Reference', icon: 'i-lucide-book-open', slot: 'reference' as const }
]

const PRESET_COLORS = ['#2496ED', '#7C3AED', '#DB2777', '#DC2626', '#EA580C', '#D97706', '#16A34A', '#0D9488', '#0284C7', '#475569']
const MAX_LOGO_BYTES = 1.5 * 1024 * 1024

const savingAppearance = ref(false)
const resettingAppearance = ref(false)
const logoHorizontalInput = ref<HTMLInputElement | null>(null)
const logoIconInput = ref<HTMLInputElement | null>(null)

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

async function onLogoFileChange(e: Event, field: 'logoHorizontalUrl' | 'logoIconUrl') {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) {
    toast.add({ title: 'Invalid file', description: 'Please choose an image file.', color: 'error' })
  } else if (file.size > MAX_LOGO_BYTES) {
    toast.add({ title: 'Image too large', description: 'Please choose an image under 1.5 MB.', color: 'error' })
  } else {
    previewAppearance({ [field]: await readFileAsDataUrl(file) })
  }
  input.value = ''
}

function clearLogo(field: 'logoHorizontalUrl' | 'logoIconUrl') {
  previewAppearance({ [field]: '' })
}

async function saveAppearanceSettings() {
  savingAppearance.value = true
  try {
    await saveAppearance({ ...appearance.value })
    toast.add({ title: 'Appearance saved', description: 'Applied for every user.', color: 'primary', icon: 'i-lucide-check' })
  } catch (e: any) {
    toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    savingAppearance.value = false
  }
}

async function revertAppearancePreview() {
  await fetchAppearance()
}

async function resetAppearanceToDefaults() {
  if (!confirm('Reset appearance to the built-in DockHub defaults?')) return
  resettingAppearance.value = true
  try {
    await resetAppearance()
    toast.add({ title: 'Appearance reset to defaults', color: 'primary', icon: 'i-lucide-rotate-ccw' })
  } catch (e: any) {
    toast.add({ title: 'Reset failed', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    resettingAppearance.value = false
  }
}

const oidcGuide = {
  checklist: [
    'Create an OIDC/OAuth client in the identity provider.',
    'Register the effective callback URL as an allowed redirect URI.',
    'Copy the issuer, client ID, and client secret into DockHub.',
    'Include scopes that expose profile, email, and group claims.',
    'Map the admin and operator groups, then save and test SSO login.'
  ],
  fields: [
    { name: 'Issuer URL', detail: 'Use the exact issuer from provider discovery, without the /.well-known/openid-configuration suffix.' },
    { name: 'Redirect URI', detail: 'Leave blank to use the shown effective URL, or set a public URL when DockHub is behind a proxy.' },
    { name: 'Scope', detail: 'Keep openid. Add profile, email, and groups when your provider requires scopes for those claims.' },
    { name: 'Claims', detail: 'Username, display name, and groups can use plain claim names or dot paths such as realm_access.roles.' },
    { name: 'Groups', detail: 'OIDC group values are matched to DockHub roles. Users without a match become viewers.' }
  ]
}

const ldapGuide = {
  checklist: [
    'Use an LDAP or LDAPS URL reachable from the DockHub server.',
    'Enter a bind DN that can search users, or leave it blank for anonymous bind if allowed.',
    'Set the user search base and a filter that includes {{username}}.',
    'Map the directory groups that should become DockHub admins or operators.',
    'Save, then test with a directory user before relying on LDAP broadly.'
  ],
  fields: [
    { name: 'Server URL', detail: 'Prefer ldaps:// on port 636 when available. ldap:// on port 389 depends on your directory policy.' },
    { name: 'Bind DN', detail: 'Use a service account DN, for example cn=dockhub,ou=service,dc=example,dc=com.' },
    { name: 'Search base', detail: 'Point this at the subtree containing user accounts, not the whole directory when you can avoid it.' },
    { name: 'Search filter', detail: 'Active Directory often uses (sAMAccountName={{username}}); OpenLDAP commonly uses (uid={{username}}).' },
    { name: 'Groups', detail: 'DockHub checks the user memberOf values against the admin and operator group fields.' }
  ]
}

const envVars = [
  { k: 'NUXT_JWT_SECRET', d: 'Secret for signing session tokens (required in production)' },
  { k: 'NUXT_DOCKER_SOCKET_PATH', d: 'Path to Docker socket (default /var/run/docker.sock)' },
  { k: 'NUXT_DOCKER_HOST / NUXT_DOCKER_PORT', d: 'Remote Docker engine over TCP (overrides socket)' },
  { k: 'NUXT_DOCKER_CA / CERT / KEY', d: 'TLS certificate chain for mutual-TLS remote Docker' },
  { k: 'NUXT_LDAP_ENABLED', d: 'Default LDAP / AD authentication state' },
  { k: 'NUXT_LDAP_URL', d: 'e.g. ldaps://ldap.example.com:636' },
  { k: 'NUXT_LDAP_BIND_DN / BIND_CREDENTIALS', d: 'Service account credentials for directory search' },
  { k: 'NUXT_LDAP_SEARCH_BASE', d: 'Base DN for user lookups' },
  { k: 'NUXT_LDAP_SEARCH_FILTER', d: 'User lookup filter (default: (uid={{username}}))' },
  { k: 'NUXT_LDAP_ADMIN_GROUP / OPERATOR_GROUP', d: 'Group DNs mapped to DockHub roles' },
  { k: 'NUXT_OIDC_ENABLED', d: 'Default OIDC single sign-on state' },
  { k: 'NUXT_OIDC_ISSUER', d: 'Provider issuer URL; endpoints are discovered automatically' },
  { k: 'NUXT_OIDC_CLIENT_ID / CLIENT_SECRET', d: 'OAuth client registered at the provider' },
  { k: 'NUXT_OIDC_REDIRECT_URI', d: 'Override the callback URL (default: {origin}/api/auth/oidc/callback)' },
  { k: 'NUXT_OIDC_SCOPE', d: 'Requested scopes (default: openid profile email groups)' },
  { k: 'NUXT_OIDC_USERNAME_CLAIM', d: 'Claim used as the DockHub username (default: preferred_username)' },
  { k: 'NUXT_OIDC_GROUPS_CLAIM', d: 'Claim carrying group names; dot-paths work (default: groups)' },
  { k: 'NUXT_OIDC_ADMIN_GROUP / OPERATOR_GROUP', d: 'Group names mapped to DockHub roles' },
  { k: 'NUXT_OIDC_PROVIDER_NAME', d: 'Label for the SSO login button' },
  { k: 'NUXT_GITLAB_TOKEN', d: 'Personal/project access token with api scope' },
  { k: 'NUXT_GITLAB_PROJECT_ID', d: 'Numeric project ID where compose files are stored' },
  { k: 'NUXT_GITLAB_BRANCH / STACKS_PATH', d: 'Branch (default: main) and folder (default: stacks)' },
  { k: 'NUXT_DATA_DIR', d: 'Directory for the SQLite database (default: ./.data)' },
  { k: 'NUXT_PUBLIC_APP_NAME', d: 'Displayed as the app name in the header' }
]
const envSortOptions = [
  { label: 'Variable', value: 'k' },
  { label: 'Description', value: 'd' }
]
const {
  items: filteredEnvVars,
  search: envSearch,
  sortBy: envSortBy,
  sortDir: envSortDir,
  sortOptions: envSortOptionsState
} = useListControls('settings:env', () => envVars, {
  sortOptions: envSortOptions,
  defaultSortBy: 'k'
})

const ldapForm = reactive({
  enabled: false,
  url: '',
  bindDN: '',
  bindCredentials: '',
  searchBase: '',
  searchFilter: '',
  groupSearchBase: '',
  groupSearchFilter: '',
  adminGroup: '',
  operatorGroup: ''
})

const oidcForm = reactive({
  enabled: false,
  issuer: '',
  clientId: '',
  clientSecret: '',
  redirectUri: '',
  scope: '',
  usernameClaim: '',
  displayNameClaim: '',
  groupsClaim: '',
  adminGroup: '',
  operatorGroup: '',
  providerName: ''
})

const savingProvider = ref<'ldap' | 'oidc' | null>(null)
const resettingProvider = ref<'ldap' | 'oidc' | null>(null)

const authLoadStatus = computed(() => authStatus.value === 'idle' ? 'pending' : authStatus.value)

watch(auth, (value) => {
  if (!value) return
  Object.assign(ldapForm, {
    enabled: value.ldap.enabled,
    url: value.ldap.url,
    bindDN: value.ldap.bindDN,
    bindCredentials: '',
    searchBase: value.ldap.searchBase,
    searchFilter: value.ldap.searchFilter,
    groupSearchBase: value.ldap.groupSearchBase,
    groupSearchFilter: value.ldap.groupSearchFilter,
    adminGroup: value.ldap.adminGroup,
    operatorGroup: value.ldap.operatorGroup
  })
  Object.assign(oidcForm, {
    enabled: value.oidc.enabled,
    issuer: value.oidc.issuer,
    clientId: value.oidc.clientId,
    clientSecret: '',
    redirectUri: value.oidc.redirectUri,
    scope: value.oidc.scope,
    usernameClaim: value.oidc.usernameClaim,
    displayNameClaim: value.oidc.displayNameClaim,
    groupsClaim: value.oidc.groupsClaim,
    adminGroup: value.oidc.adminGroup,
    operatorGroup: value.oidc.operatorGroup,
    providerName: value.oidc.providerName
  })
}, { immediate: true })

function sourceLabel(overridden?: boolean) {
  return overridden ? 'DB override' : 'Env default'
}

function sourceColor(overridden?: boolean) {
  return overridden ? 'primary' : 'neutral'
}

async function saveProvider(provider: 'ldap' | 'oidc') {
  savingProvider.value = provider
  try {
    await $fetch('/api/auth/settings', {
      method: 'PUT',
      body: {
        provider,
        settings: provider === 'ldap' ? { ...ldapForm } : { ...oidcForm }
      }
    })
    toast.add({
      title: provider === 'ldap' ? 'LDAP settings saved' : 'OIDC settings saved',
      color: 'primary',
      icon: 'i-lucide-check'
    })
    await refreshAuth()
  } catch (e: any) {
    toast.add({
      title: 'Save failed',
      description: e?.data?.statusMessage,
      color: 'error'
    })
  } finally {
    savingProvider.value = null
  }
}

async function resetProvider(provider: 'ldap' | 'oidc') {
  if (!confirm(`Reset ${provider.toUpperCase()} settings to environment defaults?`)) return
  resettingProvider.value = provider
  try {
    await $fetch(`/api/auth/settings?provider=${provider}`, { method: 'DELETE' })
    toast.add({
      title: `${provider.toUpperCase()} now follows environment defaults`,
      color: 'primary',
      icon: 'i-lucide-rotate-ccw'
    })
    await refreshAuth()
  } catch (e: any) {
    toast.add({
      title: 'Reset failed',
      description: e?.data?.statusMessage,
      color: 'error'
    })
  } finally {
    resettingProvider.value = null
  }
}
</script>

<template>
  <div>
    <PageHeader title="System settings" subtitle="Infrastructure, integrations, and persisted configuration" icon="i-lucide-settings">
      <template #actions>
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" :loading="authStatus === 'pending'" @click="refreshAuth()" />
      </template>
    </PageHeader>

    <UTabs :items="tabs" variant="link" class="max-w-5xl" :unmount-on-hide="false">
      <template #appearance>
        <div class="grid gap-4 pt-4 xl:grid-cols-2">
          <section class="panel p-5 space-y-5">
            <header class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div class="min-w-0">
                <h3 class="font-display text-sm font-semibold text-foam flex items-center gap-2">
                  <UIcon name="i-lucide-paintbrush" class="size-4 text-beacon" />
                  Branding
                </h3>
                <p class="mt-1 text-xs text-(--color-muted)">
                  Changes preview live across the whole app as you edit. Nothing is shared with other users until you save.
                </p>
              </div>
              <UBadge :color="sourceColor(appearanceOverridden)" variant="subtle" :label="sourceLabel(appearanceOverridden)" class="self-start" />
            </header>

            <UFormField label="App name" description="Shown in the sidebar header and browser tab title.">
              <UInput v-model="appearance.appName" class="w-full sm:w-72" placeholder="DockHub" />
            </UFormField>

            <UFormField label="Primary color" description="Drives buttons, links, and accents across the app.">
              <div class="flex flex-wrap items-center gap-3">
                <input v-model="appearance.primaryColor" type="color" class="size-10 cursor-pointer rounded border border-hull bg-transparent p-0.5">
                <UInput v-model="appearance.primaryColor" class="w-32 font-mono" placeholder="#2496ED" />
                <div class="flex flex-wrap gap-1.5">
                  <button
                    v-for="c in PRESET_COLORS"
                    :key="c"
                    type="button"
                    class="size-6 rounded-full ring-1 ring-hull transition hover:scale-110"
                    :style="{ background: c }"
                    :aria-label="c"
                    @click="appearance.primaryColor = c"
                  />
                </div>
              </div>
            </UFormField>

            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField label="Horizontal logo" description="Used on the login screen.">
                <div class="flex items-center gap-3 rounded-lg border border-dashed border-hull p-3">
                  <div class="flex h-12 w-32 items-center justify-center overflow-hidden rounded bg-surface-2">
                    <img v-if="appearance.logoHorizontalUrl" :src="appearance.logoHorizontalUrl" alt="" class="max-h-full max-w-full object-contain">
                    <DockHubLogo v-else size="sm" />
                  </div>
                  <div class="flex flex-col gap-1.5">
                    <UButton size="xs" color="neutral" variant="soft" icon="i-lucide-upload" label="Upload" @click="logoHorizontalInput?.click()" />
                    <UButton v-if="appearance.logoHorizontalUrl" size="xs" color="neutral" variant="ghost" icon="i-lucide-x" label="Use default" @click="clearLogo('logoHorizontalUrl')" />
                  </div>
                  <input ref="logoHorizontalInput" type="file" accept="image/*" class="hidden" @change="onLogoFileChange($event, 'logoHorizontalUrl')">
                </div>
              </UFormField>
              <UFormField label="Icon logo" description="Used in the sidebar and header.">
                <div class="flex items-center gap-3 rounded-lg border border-dashed border-hull p-3">
                  <div class="flex h-12 w-12 items-center justify-center overflow-hidden rounded bg-surface-2">
                    <img v-if="appearance.logoIconUrl" :src="appearance.logoIconUrl" alt="" class="max-h-full max-w-full object-contain">
                    <DockHubLogo v-else variant="icon" size="sm" />
                  </div>
                  <div class="flex flex-col gap-1.5">
                    <UButton size="xs" color="neutral" variant="soft" icon="i-lucide-upload" label="Upload" @click="logoIconInput?.click()" />
                    <UButton v-if="appearance.logoIconUrl" size="xs" color="neutral" variant="ghost" icon="i-lucide-x" label="Use default" @click="clearLogo('logoIconUrl')" />
                  </div>
                  <input ref="logoIconInput" type="file" accept="image/*" class="hidden" @change="onLogoFileChange($event, 'logoIconUrl')">
                </div>
              </UFormField>
            </div>

            <footer class="flex flex-col gap-2 border-t border-hull pt-4 sm:flex-row sm:justify-end">
              <UButton color="neutral" variant="ghost" label="Revert preview" icon="i-lucide-undo-2" @click="revertAppearancePreview" />
              <UButton
                color="neutral"
                variant="ghost"
                label="Reset to defaults"
                icon="i-lucide-rotate-ccw"
                :disabled="!appearanceOverridden"
                :loading="resettingAppearance"
                @click="resetAppearanceToDefaults"
              />
              <UButton color="primary" label="Save appearance" icon="i-lucide-save" :loading="savingAppearance" @click="saveAppearanceSettings" />
            </footer>
          </section>

          <section class="panel p-5">
            <h3 class="font-display text-sm font-semibold text-foam flex items-center gap-2 mb-4">
              <UIcon name="i-lucide-eye" class="size-4 text-beacon" />
              Live preview
            </h3>
            <div class="overflow-hidden rounded-lg border border-hull">
              <div class="flex items-center gap-3 border-b border-hull-soft bg-ink px-4 py-3">
                <DockHubLogo variant="icon" class="size-8 shrink-0" />
                <span class="font-display text-sm font-semibold tracking-tight text-foam">{{ appearance.appName }}</span>
              </div>
              <div class="space-y-3 bg-surface p-4">
                <DockHubLogo size="sm" />
                <div class="flex flex-wrap gap-2">
                  <UButton color="primary" label="Primary action" icon="i-lucide-rocket" />
                  <UButton color="primary" variant="soft" label="Soft" />
                  <UButton color="primary" variant="outline" label="Outline" />
                  <UBadge color="primary" variant="subtle" label="Badge" />
                </div>
                <p class="text-xs text-(--color-muted)">
                  This preview reflects the same CSS variables used across the whole console, including this Settings page.
                </p>
              </div>
            </div>
          </section>
        </div>
      </template>

      <template #integrations>
        <div class="grid gap-4 sm:grid-cols-2 pt-4">
          <div class="panel p-5">
            <h3 class="font-display text-sm font-semibold text-foam mb-3 flex items-center gap-2">
              <UIcon name="i-lucide-git-branch" class="size-4 text-beacon" />
              GitLab
            </h3>
            <div class="flex items-center gap-2 mb-3">
              <span class="dot" :class="gl?.enabled ? 'dot-running' : 'dot-idle'" />
              <span class="text-sm" :class="gl?.enabled ? 'status-running' : 'text-(--color-muted)'">
                {{ gl?.enabled ? 'Connected' : 'Not configured' }}
              </span>
            </div>
            <dl v-if="gl?.enabled" class="space-y-1.5 text-sm">
              <div class="flex justify-between gap-3">
                <dt class="text-faint">Project</dt>
                <dd class="font-mono text-(--color-muted)">{{ gl.projectId }}</dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="text-faint">Branch</dt>
                <dd class="font-mono text-(--color-muted)">{{ gl.branch }}</dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="text-faint">Path</dt>
                <dd class="font-mono text-(--color-muted)">{{ gl.stacksPath }}/</dd>
              </div>
            </dl>
            <p v-else class="text-xs text-faint">
              Set the <code class="font-mono text-beacon">NUXT_GITLAB_*</code> env vars to enable compose file versioning and rollbacks.
            </p>
          </div>
        </div>
      </template>

      <template #authentication>
        <div class="pt-4">
          <DataState :status="authLoadStatus" :error="authError" :empty="false">
            <div class="grid gap-5 xl:grid-cols-2">
              <section class="panel p-5 space-y-5">
                <header class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div class="min-w-0">
                    <h3 class="font-display text-sm font-semibold text-foam flex items-center gap-2">
                      <UIcon name="i-lucide-key-round" class="size-4 text-beacon" />
                      OIDC single sign-on
                    </h3>
                    <div class="mt-2 flex flex-wrap items-center gap-2 text-sm">
                      <span class="dot" :class="oidcForm.enabled ? 'dot-running' : 'dot-idle'" />
                      <span :class="oidcForm.enabled ? 'status-running' : 'text-(--color-muted)'">
                        {{ oidcForm.enabled ? `Enabled - ${oidcForm.providerName || 'SSO'}` : 'Disabled' }}
                      </span>
                      <UBadge :color="sourceColor(auth?.oidc.overridden)" variant="subtle" :label="sourceLabel(auth?.oidc.overridden)" />
                    </div>
                  </div>
                  <div class="flex items-center gap-2 self-start">
                    <UPopover :content="{ align: 'end', sideOffset: 8 }">
                      <UButton icon="i-lucide-circle-help" color="neutral" variant="ghost" aria-label="OIDC setup guide" />
                      <template #content>
                        <div class="w-96 max-w-[calc(100vw-2rem)] max-h-[calc(100vh-6rem)] overflow-y-auto p-4">
                          <div class="flex items-center gap-2">
                            <UIcon name="i-lucide-key-round" class="size-4 text-beacon" />
                            <p class="text-sm font-semibold text-foam">OIDC setup guide</p>
                          </div>
                          <ol class="mt-3 space-y-2 text-sm text-(--color-muted)">
                            <li v-for="(item, index) in oidcGuide.checklist" :key="item" class="flex gap-2">
                              <span class="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-semibold text-beacon">
                                {{ index + 1 }}
                              </span>
                              <span>{{ item }}</span>
                            </li>
                          </ol>
                          <div class="mt-4 border-t border-hull pt-3">
                            <p class="mb-2 text-xs font-semibold uppercase text-faint">Field notes</p>
                            <div class="space-y-2">
                              <div v-for="field in oidcGuide.fields" :key="field.name">
                                <p class="text-xs font-medium text-foam">{{ field.name }}</p>
                                <p class="text-xs text-(--color-muted)">{{ field.detail }}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </template>
                    </UPopover>
                    <USwitch v-model="oidcForm.enabled" color="primary" />
                  </div>
                </header>

                <div class="grid gap-3 sm:grid-cols-2">
                  <UFormField label="Provider label">
                    <UInput v-model="oidcForm.providerName" class="w-full" placeholder="SSO" />
                  </UFormField>
                  <UFormField label="Issuer URL">
                    <UInput v-model="oidcForm.issuer" class="w-full font-mono" placeholder="https://idp.example.com/realms/main" />
                  </UFormField>
                  <UFormField label="Client ID">
                    <UInput v-model="oidcForm.clientId" class="w-full font-mono" />
                  </UFormField>
                  <UFormField label="Client secret">
                    <UInput
                      v-model="oidcForm.clientSecret"
                      type="password"
                      class="w-full"
                      :placeholder="auth?.oidc.hasClientSecret ? 'Configured - leave blank to keep' : 'Not set'"
                    />
                  </UFormField>
                  <UFormField label="Redirect URI" class="min-w-0">
                    <UInput v-model="oidcForm.redirectUri" class="w-full font-mono" placeholder="Auto from request origin" />
                    <p
                      class="mt-1 max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-xs text-faint"
                      :title="auth?.oidc.effectiveRedirectUri"
                    >
                      Effective: <span class="font-mono">{{ auth?.oidc.effectiveRedirectUri || 'auto' }}</span>
                    </p>
                  </UFormField>
                  <UFormField label="Scope">
                    <UInput v-model="oidcForm.scope" class="w-full font-mono" />
                  </UFormField>
                  <UFormField label="Username claim">
                    <UInput v-model="oidcForm.usernameClaim" class="w-full font-mono" />
                  </UFormField>
                  <UFormField label="Display name claim">
                    <UInput v-model="oidcForm.displayNameClaim" class="w-full font-mono" />
                  </UFormField>
                  <UFormField label="Groups claim">
                    <UInput v-model="oidcForm.groupsClaim" class="w-full font-mono" />
                  </UFormField>
                  <UFormField label="Admin group">
                    <UInput v-model="oidcForm.adminGroup" class="w-full font-mono" />
                  </UFormField>
                  <UFormField label="Operator group">
                    <UInput v-model="oidcForm.operatorGroup" class="w-full font-mono" />
                  </UFormField>
                </div>

                <footer class="flex flex-col gap-2 border-t border-hull pt-4 sm:flex-row sm:justify-end">
                  <UButton
                    color="neutral"
                    variant="ghost"
                    label="Use env defaults"
                    icon="i-lucide-rotate-ccw"
                    :disabled="!auth?.oidc.overridden"
                    :loading="resettingProvider === 'oidc'"
                    @click="resetProvider('oidc')"
                  />
                  <UButton
                    color="primary"
                    label="Save OIDC"
                    icon="i-lucide-save"
                    :loading="savingProvider === 'oidc'"
                    @click="saveProvider('oidc')"
                  />
                </footer>
              </section>

              <section class="panel p-5 space-y-5">
                <header class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div class="min-w-0">
                    <h3 class="font-display text-sm font-semibold text-foam flex items-center gap-2">
                      <UIcon name="i-lucide-building-2" class="size-4 text-beacon" />
                      LDAP / Active Directory
                    </h3>
                    <div class="mt-2 flex flex-wrap items-center gap-2 text-sm">
                      <span class="dot" :class="ldapForm.enabled ? 'dot-running' : 'dot-idle'" />
                      <span :class="ldapForm.enabled ? 'status-running' : 'text-(--color-muted)'">
                        {{ ldapForm.enabled ? 'Enabled' : 'Disabled - local auth only' }}
                      </span>
                      <UBadge :color="sourceColor(auth?.ldap.overridden)" variant="subtle" :label="sourceLabel(auth?.ldap.overridden)" />
                    </div>
                  </div>
                  <div class="flex items-center gap-2 self-start">
                    <UPopover :content="{ align: 'end', sideOffset: 8 }">
                      <UButton icon="i-lucide-circle-help" color="neutral" variant="ghost" aria-label="LDAP setup guide" />
                      <template #content>
                        <div class="w-96 max-w-[calc(100vw-2rem)] max-h-[calc(100vh-6rem)] overflow-y-auto p-4">
                          <div class="flex items-center gap-2">
                            <UIcon name="i-lucide-building-2" class="size-4 text-beacon" />
                            <p class="text-sm font-semibold text-foam">LDAP setup guide</p>
                          </div>
                          <ol class="mt-3 space-y-2 text-sm text-(--color-muted)">
                            <li v-for="(item, index) in ldapGuide.checklist" :key="item" class="flex gap-2">
                              <span class="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-semibold text-beacon">
                                {{ index + 1 }}
                              </span>
                              <span>{{ item }}</span>
                            </li>
                          </ol>
                          <div class="mt-4 border-t border-hull pt-3">
                            <p class="mb-2 text-xs font-semibold uppercase text-faint">Field notes</p>
                            <div class="space-y-2">
                              <div v-for="field in ldapGuide.fields" :key="field.name">
                                <p class="text-xs font-medium text-foam">{{ field.name }}</p>
                                <p class="text-xs text-(--color-muted)">{{ field.detail }}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </template>
                    </UPopover>
                    <USwitch v-model="ldapForm.enabled" color="primary" />
                  </div>
                </header>

                <div class="grid gap-3 sm:grid-cols-2">
                  <UFormField label="Server URL">
                    <UInput v-model="ldapForm.url" class="w-full font-mono" placeholder="ldaps://ldap.example.com:636" />
                  </UFormField>
                  <UFormField label="Bind DN">
                    <UInput v-model="ldapForm.bindDN" class="w-full font-mono" />
                  </UFormField>
                  <UFormField label="Bind credentials">
                    <UInput
                      v-model="ldapForm.bindCredentials"
                      type="password"
                      class="w-full"
                      :placeholder="auth?.ldap.hasBindCredentials ? 'Configured - leave blank to keep' : 'Not set'"
                    />
                  </UFormField>
                  <UFormField label="User search base">
                    <UInput v-model="ldapForm.searchBase" class="w-full font-mono" />
                  </UFormField>
                  <UFormField label="User search filter">
                    <UInput v-model="ldapForm.searchFilter" class="w-full font-mono" />
                  </UFormField>
                  <UFormField label="Group search base">
                    <UInput v-model="ldapForm.groupSearchBase" class="w-full font-mono" />
                  </UFormField>
                  <UFormField label="Group search filter">
                    <UInput v-model="ldapForm.groupSearchFilter" class="w-full font-mono" />
                  </UFormField>
                  <UFormField label="Admin group">
                    <UInput v-model="ldapForm.adminGroup" class="w-full font-mono" />
                  </UFormField>
                  <UFormField label="Operator group">
                    <UInput v-model="ldapForm.operatorGroup" class="w-full font-mono" />
                  </UFormField>
                </div>

                <footer class="flex flex-col gap-2 border-t border-hull pt-4 sm:flex-row sm:justify-end">
                  <UButton
                    color="neutral"
                    variant="ghost"
                    label="Use env defaults"
                    icon="i-lucide-rotate-ccw"
                    :disabled="!auth?.ldap.overridden"
                    :loading="resettingProvider === 'ldap'"
                    @click="resetProvider('ldap')"
                  />
                  <UButton
                    color="primary"
                    label="Save LDAP"
                    icon="i-lucide-save"
                    :loading="savingProvider === 'ldap'"
                    @click="saveProvider('ldap')"
                  />
                </footer>
              </section>
            </div>
          </DataState>
        </div>
      </template>

      <template #reference>
        <div class="panel p-5 mt-4">
          <p class="text-xs text-(--color-muted) mb-4">
            Environment variables provide defaults. Saved authentication settings are persisted in the SQLite app settings table and override those defaults until reset.
          </p>
          <ListControls
            v-model:search="envSearch"
            v-model:sort-by="envSortBy"
            v-model:sort-dir="envSortDir"
            :sort-options="envSortOptionsState"
            placeholder="Search environment variables"
          />
          <div class="space-y-0">
            <div
              v-for="e in filteredEnvVars"
              :key="e.k"
              class="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 py-2 border-b border-hull/40 last:border-0"
            >
              <code class="font-mono text-xs text-beacon sm:w-80 shrink-0">{{ e.k }}</code>
              <span class="text-xs text-(--color-muted)">{{ e.d }}</span>
            </div>
          </div>
        </div>
      </template>
    </UTabs>
  </div>
</template>
