<script setup lang="ts">
// Admin > Security > Authentication. Local, OIDC SSO, and LDAP/AD configuration
// (env defaults overridable by DB-stored settings). Was a tab in old /settings.
definePageMeta({ middleware: 'admin' })

interface LocalAuthSettings {
  enabled: true
  hideLogin: boolean
  sessionTimeoutMinutes: number
  passwordMinLength: number
  passwordRequireUppercase: boolean
  passwordRequireLowercase: boolean
  passwordRequireNumber: boolean
  passwordRequireSpecial: boolean
  overridden: boolean
}

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
  managerGroup: string
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
  rolesClaim: string
  adminGroup: string
  managerGroup: string
  operatorGroup: string
  providerName: string
  iconUrl: string
  overridden: boolean
}

interface AuthSettingsResponse {
  local: LocalAuthSettings
  ldap: LdapSettings
  oidc: OidcSettings
}

const toast = useToast()

const {
  data: auth,
  status: authStatus,
  error: authError,
  refresh: refreshAuth
} = useFetch<AuthSettingsResponse>('/api/auth/settings', { lazy: true })

const oidcGuide = {
  checklist: [
    'Create an OIDC/OAuth client in the identity provider.',
    'Register the effective callback URL as an allowed redirect URI.',
    'Copy the issuer, client ID, and client secret into KNetraHub.',
    'Include scopes that expose profile, email, and group claims.',
    'Map the admin, manager, and operator groups, save, then use Test & query to verify popup login and UserInfo.'
  ],
  fields: [
    { name: 'Issuer URL', detail: 'Use the exact issuer from provider discovery, without the /.well-known/openid-configuration suffix.' },
    { name: 'Redirect URI', detail: 'Leave blank to use the shown effective URL, or set a public URL when KNetraHub is behind a proxy.' },
    { name: 'Scope', detail: 'Keep openid. Add profile, email, and groups when your provider requires scopes for those claims.' },
    { name: 'Claims', detail: 'Username, display name, and groups can use plain claim names or dot paths such as realm_access.roles.' },
    { name: 'Groups', detail: 'OIDC group values are matched to KNetraHub roles (admin > manager > operator). Users without a match become viewers.' }
  ]
}

const keycloakClientRolesGuide = {
  claimPath: 'resource_access.client-knetrahub-web.roles',
  steps: [
    'In Clients, open client-knetrahub-web and create the client roles KNetraHub will map.',
    'Assign those client roles to the test user under Users > Role mapping > Assign role > Filter by clients.',
    'If Full Scope Allowed is off, include those roles in client-knetrahub-web role scope mappings so Keycloak does not filter them from tokens.',
    'Open Clients > client-knetrahub-web > Client scopes, then open its dedicated client scope.',
    'Under Mappers, add a mapper by configuration and choose User Client Role.',
    'Apply the mapper values below, save it, then sign in again through Test & query to issue fresh tokens.'
  ],
  settings: [
    ['Name', 'client-knetrahub-web roles'],
    ['Client ID', 'client-knetrahub-web'],
    ['Token Claim Name', 'resource_access.client-knetrahub-web.roles'],
    ['Claim JSON Type', 'String'],
    ['Multivalued', 'On'],
    ['Add to access token', 'On'],
    ['Add to ID token', 'On'],
    ['Add to userinfo', 'On']
  ],
  expected: {
    resource_access: {
      'client-knetrahub-web': {
        roles: ['viewer', 'operator']
      }
    }
  }
}

const oidcGuideTabs = [
  { label: 'Quick setup', icon: 'i-lucide-list-checks', slot: 'quickstart' as const },
  { label: 'Field reference', icon: 'i-lucide-table-properties', slot: 'fields' as const },
  { label: 'Keycloak roles', icon: 'i-lucide-shield-check', slot: 'keycloak' as const }
]

const ldapGuide = {
  checklist: [
    'Use an LDAP or LDAPS URL reachable from the KNetraHub server.',
    'Enter a bind DN that can search users, or leave it blank for anonymous bind if allowed.',
    'Set the user search base and a filter that includes {{username}}.',
    'Map the directory groups that should become KNetraHub admins, managers, or operators.',
    'Save, then test with a directory user before relying on LDAP broadly.'
  ],
  fields: [
    { name: 'Server URL', detail: 'Prefer ldaps:// on port 636 when available. ldap:// on port 389 depends on your directory policy.' },
    { name: 'Bind DN', detail: 'Use a service account DN, for example cn=knetrahub,ou=service,dc=example,dc=com.' },
    { name: 'Search base', detail: 'Point this at the subtree containing user accounts, not the whole directory when you can avoid it.' },
    { name: 'Search filter', detail: 'Active Directory often uses (sAMAccountName={{username}}); OpenLDAP commonly uses (uid={{username}}).' },
    { name: 'Groups', detail: 'KNetraHub checks the user memberOf values against the admin, manager, and operator group fields (admin > manager > operator).' }
  ]
}

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
  managerGroup: '',
  operatorGroup: ''
})

const localForm = reactive({
  hideLogin: false,
  sessionTimeoutMinutes: 720,
  passwordMinLength: 8,
  passwordRequireUppercase: false,
  passwordRequireLowercase: false,
  passwordRequireNumber: false,
  passwordRequireSpecial: false
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
  rolesClaim: '',
  adminGroup: '',
  managerGroup: '',
  operatorGroup: '',
  providerName: '',
  iconUrl: ''
})

type SettingsProvider = 'local' | 'ldap' | 'oidc'
const savingProvider = ref<SettingsProvider | null>(null)
const resettingProvider = ref<SettingsProvider | null>(null)

const MAX_OIDC_ICON_BYTES = 1.5 * 1024 * 1024
const oidcIconInput = ref<HTMLInputElement | null>(null)

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

async function onOidcIconFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) {
    toast.add({ title: 'Invalid file', description: 'Please choose an image file.', color: 'error' })
  } else if (file.size > MAX_OIDC_ICON_BYTES) {
    toast.add({ title: 'Image too large', description: 'Please choose an image under 1.5 MB.', color: 'error' })
  } else {
    oidcForm.iconUrl = await readFileAsDataUrl(file)
  }
  input.value = ''
}

function clearOidcIcon() {
  oidcForm.iconUrl = ''
}

interface OidcTestResult {
  ok: boolean
  tookMs: number
  issuer: string
  endpoints: { authorization: string, token: string, jwks: string, userinfo: string | null }
  scopesSupported: string[] | null
  claimsSupported: string[] | null
  grantTypesSupported: string[] | null
  discovery: Record<string, unknown>
  scope: string
}

interface OidcLoginTestReport {
  ok: true
  completedAt: string
  tookMs: number
  issuer: string
  clientId: string
  redirectUri: string
  endpoints: { authorization: string, token: string, jwks: string, userinfo: string | null }
  token: { tookMs: number, response: Record<string, unknown> }
  idToken: {
    valid: true
    tookMs: number
    header: Record<string, unknown>
    claims: Record<string, unknown>
  }
  accessToken: {
    present: boolean
    format: 'jwt' | 'opaque' | null
    valid: boolean | null
    tookMs: number | null
    header: Record<string, unknown> | null
    claims: Record<string, unknown> | null
    error: string | null
  }
  userinfo: {
    advertised: boolean
    attempted: boolean
    ok: boolean | null
    tookMs: number | null
    endpoint: string | null
    response: Record<string, unknown> | null
    error: string | null
  }
  rolesClaim: {
    path: string
    found: boolean
    source: 'id_token' | 'userinfo' | 'access_token' | null
    value: unknown
  }
  mappedUser: {
    username: string
    displayName: string
    email?: string
    role: string
    realmRoles: string[]
  }
}

interface OidcTestPopupMessage {
  type: 'knetrahub:oidc-login-test'
  ok: boolean
  report?: OidcLoginTestReport
  error?: string
}

const oidcGuideOpen = ref(false)
const oidcTestOpen = ref(false)
const testingOidc = ref(false)
const oidcTestResult = ref<OidcTestResult | null>(null)
const oidcTestErrorMsg = ref('')
const testingOidcLogin = ref(false)
const oidcLoginTestResult = ref<OidcLoginTestReport | null>(null)
const oidcLoginTestErrorMsg = ref('')
let oidcTestPopup: Window | null = null
let oidcTestPopupPoll: ReturnType<typeof setInterval> | null = null

async function testOidc() {
  oidcTestOpen.value = true
  testingOidc.value = true
  oidcTestErrorMsg.value = ''
  oidcTestResult.value = null
  try {
    oidcTestResult.value = await $fetch<OidcTestResult>('/api/auth/settings/oidc-test', {
      method: 'POST',
      body: { issuer: oidcForm.issuer, clientId: oidcForm.clientId }
    })
    toast.add({ title: 'OIDC discovery succeeded', description: `Responded in ${oidcTestResult.value.tookMs}ms`, color: 'primary', icon: 'i-lucide-check' })
  } catch (e: any) {
    oidcTestErrorMsg.value = e?.data?.statusMessage || e?.message || 'Test failed'
    toast.add({ title: 'OIDC test failed', description: oidcTestErrorMsg.value, color: 'error' })
  } finally {
    testingOidc.value = false
  }
}

const oidcLoginHasUnsavedChanges = computed(() => {
  const saved = auth.value?.oidc
  if (!saved) return true
  if (oidcForm.clientSecret) return true
  const fields: (keyof typeof oidcForm)[] = [
    'issuer', 'clientId', 'redirectUri', 'scope', 'usernameClaim',
    'displayNameClaim', 'groupsClaim', 'rolesClaim', 'adminGroup', 'managerGroup', 'operatorGroup'
  ]
  return fields.some(field => String(oidcForm[field] ?? '').trim() !== String(saved[field] ?? '').trim())
})

function startOidcLoginTest() {
  oidcLoginTestErrorMsg.value = ''
  oidcLoginTestResult.value = null

  if (oidcLoginHasUnsavedChanges.value) {
    oidcLoginTestErrorMsg.value = 'Save the current OIDC changes first. The popup uses saved settings so the client secret never leaves the server.'
    return
  }

  if (oidcTestPopup && !oidcTestPopup.closed) oidcTestPopup.close()
  if (oidcTestPopupPoll) clearInterval(oidcTestPopupPoll)

  const width = 820
  const height = 860
  const left = Math.max(0, window.screenX + Math.round((window.outerWidth - width) / 2))
  const top = Math.max(0, window.screenY + Math.round((window.outerHeight - height) / 2))
  oidcTestPopup = window.open(
    '/api/auth/oidc/test-login',
    'knetrahub-oidc-login-test',
    `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
  )

  if (!oidcTestPopup) {
    oidcLoginTestErrorMsg.value = 'The login popup was blocked. Allow popups for this site and try again.'
    return
  }

  oidcTestPopup.focus()
  testingOidcLogin.value = true
  oidcTestPopupPoll = setInterval(() => {
    if (!oidcTestPopup?.closed) return
    if (oidcTestPopupPoll) clearInterval(oidcTestPopupPoll)
    oidcTestPopupPoll = null
    if (testingOidcLogin.value) {
      testingOidcLogin.value = false
      oidcLoginTestErrorMsg.value = 'Login test window was closed before a response was received.'
    }
  }, 500)
}

function handleOidcTestMessage(event: MessageEvent<OidcTestPopupMessage>) {
  if (event.origin !== window.location.origin || event.source !== oidcTestPopup) return
  if (event.data?.type !== 'knetrahub:oidc-login-test') return

  testingOidcLogin.value = false
  if (oidcTestPopupPoll) clearInterval(oidcTestPopupPoll)
  oidcTestPopupPoll = null

  if (event.data.ok && event.data.report) {
    oidcLoginTestResult.value = event.data.report
    oidcLoginTestErrorMsg.value = ''
    toast.add({
      title: 'OIDC login test succeeded',
      description: event.data.report.userinfo.ok === true
        ? 'Token validation and UserInfo query passed.'
        : 'Login passed; review the UserInfo result.',
      color: 'primary',
      icon: 'i-lucide-shield-check'
    })
  } else {
    oidcLoginTestResult.value = null
    oidcLoginTestErrorMsg.value = event.data.error || 'OIDC login test failed'
    toast.add({ title: 'OIDC login test failed', description: oidcLoginTestErrorMsg.value, color: 'error' })
  }
}

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

onMounted(() => window.addEventListener('message', handleOidcTestMessage))
onBeforeUnmount(() => {
  window.removeEventListener('message', handleOidcTestMessage)
  if (oidcTestPopupPoll) clearInterval(oidcTestPopupPoll)
})

const authLoadStatus = computed(() => authStatus.value === 'idle' ? 'pending' : authStatus.value)

watch(auth, (value) => {
  if (!value) return
  Object.assign(localForm, {
    hideLogin: value.local.hideLogin,
    sessionTimeoutMinutes: value.local.sessionTimeoutMinutes,
    passwordMinLength: value.local.passwordMinLength,
    passwordRequireUppercase: value.local.passwordRequireUppercase,
    passwordRequireLowercase: value.local.passwordRequireLowercase,
    passwordRequireNumber: value.local.passwordRequireNumber,
    passwordRequireSpecial: value.local.passwordRequireSpecial
  })
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
    managerGroup: value.ldap.managerGroup,
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
    rolesClaim: value.oidc.rolesClaim,
    adminGroup: value.oidc.adminGroup,
    managerGroup: value.oidc.managerGroup,
    operatorGroup: value.oidc.operatorGroup,
    providerName: value.oidc.providerName,
    iconUrl: value.oidc.iconUrl
  })
}, { immediate: true })

function sourceLabel(overridden?: boolean) {
  return overridden ? 'DB override' : 'Env default'
}
function sourceColor(overridden?: boolean) {
  return overridden ? 'primary' : 'neutral'
}

async function saveProvider(provider: SettingsProvider) {
  savingProvider.value = provider
  try {
    await $fetch('/api/auth/settings', {
      method: 'PUT',
      body: {
        provider,
        settings: provider === 'local' ? { ...localForm } : provider === 'ldap' ? { ...ldapForm } : { ...oidcForm }
      }
    })
    toast.add({
      title: provider === 'local' ? 'Local user settings saved' : provider === 'ldap' ? 'LDAP settings saved' : 'OIDC settings saved',
      color: 'primary',
      icon: 'i-lucide-check'
    })
    await refreshAuth()
  } catch (e: any) {
    toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    savingProvider.value = null
  }
}

async function resetProvider(provider: SettingsProvider) {
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
    toast.add({ title: 'Reset failed', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    resettingProvider.value = null
  }
}

async function copyLocalRecoveryUrl() {
  const url = `${window.location.origin}/login?local=1`
  try {
    await navigator.clipboard.writeText(url)
    toast.add({ title: 'Recovery login URL copied', description: url, color: 'primary', icon: 'i-lucide-copy-check' })
  } catch {
    toast.add({ title: 'Recovery login URL', description: url, color: 'neutral' })
  }
}
</script>

<template>
  <div>
    <PageHeader title="Authentication" subtitle="Local users, OIDC single sign-on, and LDAP / Active Directory" icon="i-lucide-shield-check">
      <template #actions>
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" :loading="authStatus === 'pending'" @click="refreshAuth()" />
      </template>
    </PageHeader>

    <DataState :status="authLoadStatus" :error="authError" :empty="false">
      <div class="grid gap-5 xl:grid-cols-2">
        <section class="panel space-y-5 p-5 xl:col-span-2">
          <header class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div class="min-w-0">
              <h3 class="flex items-center gap-2 font-display text-sm font-semibold text-foam">
                <UIcon name="i-lucide-user-key" class="size-4 text-beacon" />
                Local users
              </h3>
              <div class="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <span class="dot dot-running" />
                <span class="status-running">Enabled · permanent recovery access</span>
                <UBadge :color="sourceColor(auth?.local.overridden)" variant="subtle" :label="sourceLabel(auth?.local.overridden)" />
              </div>
            </div>
            <div class="flex items-center gap-2 self-start">
              <span class="text-xs text-faint">Cannot be disabled</span>
              <USwitch :model-value="true" color="primary" disabled aria-label="Local user authentication is always enabled" />
            </div>
          </header>

          <div class="grid gap-5 lg:grid-cols-2">
            <div class="space-y-4">
              <div>
                <p class="text-xs font-semibold uppercase tracking-wider text-faint">Login &amp; session</p>
                <p class="mt-1 text-xs text-(--color-muted)">Local authentication remains active even when its form is hidden.</p>
              </div>

              <div class="panel-flush flex items-start justify-between gap-4 p-3">
                <div>
                  <p class="text-sm font-medium text-foam">Hide local login form</p>
                  <p class="mt-1 text-xs text-faint">Removes the password form from the normal login page when LDAP is disabled.</p>
                </div>
                <USwitch v-model="localForm.hideLogin" color="primary" />
              </div>

              <div v-if="localForm.hideLogin" class="notice-warning panel-flush space-y-2 p-3 text-xs">
                <div class="flex items-start gap-2">
                  <UIcon name="i-lucide-eye-off" class="mt-0.5 size-4 shrink-0" />
                  <p>
                    Recovery sign-in remains available at <span class="font-mono text-foam">/login?local=1</span>.
                    This hides the form only; it does not disable or secure the local login API.
                  </p>
                </div>
                <UButton size="xs" color="warning" variant="soft" icon="i-lucide-copy" label="Copy recovery URL" @click="copyLocalRecoveryUrl" />
              </div>

              <UFormField
                label="Session timeout (minutes)"
                description="Absolute lifetime for newly issued local, LDAP, and OIDC browser sessions. Existing sessions keep their current expiry."
              >
                <UInput v-model.number="localForm.sessionTimeoutMinutes" type="number" :min="5" :max="43200" class="w-full font-mono" />
              </UFormField>
            </div>

            <div class="space-y-4">
              <div>
                <p class="text-xs font-semibold uppercase tracking-wider text-faint">Password policy</p>
                <p class="mt-1 text-xs text-(--color-muted)">Applied whenever a local password is created or changed; existing passwords are not invalidated.</p>
              </div>

              <UFormField label="Minimum password length" description="Allowed range: 8–128 characters.">
                <UInput v-model.number="localForm.passwordMinLength" type="number" :min="8" :max="128" class="w-full font-mono" />
              </UFormField>

              <div class="grid gap-2 sm:grid-cols-2">
                <label class="panel-flush flex cursor-pointer items-center justify-between gap-3 p-3 text-sm text-foam">
                  Require uppercase
                  <USwitch v-model="localForm.passwordRequireUppercase" color="primary" />
                </label>
                <label class="panel-flush flex cursor-pointer items-center justify-between gap-3 p-3 text-sm text-foam">
                  Require lowercase
                  <USwitch v-model="localForm.passwordRequireLowercase" color="primary" />
                </label>
                <label class="panel-flush flex cursor-pointer items-center justify-between gap-3 p-3 text-sm text-foam">
                  Require number
                  <USwitch v-model="localForm.passwordRequireNumber" color="primary" />
                </label>
                <label class="panel-flush flex cursor-pointer items-center justify-between gap-3 p-3 text-sm text-foam">
                  Require special character
                  <USwitch v-model="localForm.passwordRequireSpecial" color="primary" />
                </label>
              </div>
            </div>
          </div>

          <footer class="flex flex-col gap-2 border-t border-hull pt-4 sm:flex-row sm:justify-end">
            <UButton
              color="neutral"
              variant="ghost"
              label="Use env defaults"
              icon="i-lucide-rotate-ccw"
              :disabled="!auth?.local.overridden"
              :loading="resettingProvider === 'local'"
              @click="resetProvider('local')"
            />
            <UButton
              color="primary"
              label="Save local settings"
              icon="i-lucide-save"
              :loading="savingProvider === 'local'"
              @click="saveProvider('local')"
            />
          </footer>
        </section>

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
              <UButton
                icon="i-lucide-circle-help"
                color="neutral"
                variant="ghost"
                aria-label="OIDC setup guide"
                @click="oidcGuideOpen = true"
              />
              <USwitch v-model="oidcForm.enabled" color="primary" />
            </div>
          </header>

          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="Provider label">
              <UInput v-model="oidcForm.providerName" class="w-full" placeholder="SSO" />
            </UFormField>
            <UFormField label="Login button icon" description="Shown on the login page's Continue with... button.">
              <div class="flex items-center gap-3 rounded-lg border border-dashed border-hull p-3">
                <div class="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded bg-surface-2">
                  <img v-if="oidcForm.iconUrl" :src="oidcForm.iconUrl" alt="" class="max-h-full max-w-full object-contain">
                  <UIcon v-else name="i-lucide-key-round" class="size-5 text-(--color-muted)" />
                </div>
                <div class="flex flex-col gap-1.5">
                  <UButton size="xs" color="neutral" variant="soft" icon="i-lucide-upload" label="Upload" @click="oidcIconInput?.click()" />
                  <UButton v-if="oidcForm.iconUrl" size="xs" color="neutral" variant="ghost" icon="i-lucide-x" label="Use default" @click="clearOidcIcon" />
                </div>
                <input ref="oidcIconInput" type="file" accept="image/*" class="hidden" @change="onOidcIconFileChange">
              </div>
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
            <UFormField label="Realm / client roles claim" description="Drives per-app access. For this Keycloak client, use resource_access.client-knetrahub-web.roles and enable that mapper for the ID token, access token, and UserInfo.">
              <UInput v-model="oidcForm.rolesClaim" class="w-full font-mono" placeholder="resource_access.client-knetrahub-web.roles" />
            </UFormField>
            <UFormField label="Admin group">
              <UInput v-model="oidcForm.adminGroup" class="w-full font-mono" />
            </UFormField>
            <UFormField label="Manager group">
              <UInput v-model="oidcForm.managerGroup" class="w-full font-mono" />
            </UFormField>
            <UFormField label="Operator group">
              <UInput v-model="oidcForm.operatorGroup" class="w-full font-mono" />
            </UFormField>
          </div>

          <div class="panel-flush flex items-start gap-2 bg-surface-2/50 p-3 text-xs">
            <UIcon name="i-lucide-info" class="mt-0.5 size-4 shrink-0 text-beacon" />
            <div class="space-y-1 text-(--color-muted)">
              <p>
                <strong class="text-foam">Admin group</strong>, <strong class="text-foam">Manager group</strong>, and <strong class="text-foam">Operator group</strong> only set the user's
                <strong class="text-foam">global portal role</strong> - admin gets full portal control (Settings, Users, Audit, and every <span class="font-mono">/admin</span> page
                including this one); manager gets approval/oversight plus audit and report access; operator gets alert management plus read-only portal access; no match falls back to viewer.
                Precedence when a user belongs to more than one group: admin &gt; manager &gt; operator.
              </p>
              <p>
                Neither one grants access to <strong class="text-foam">Docker, Monitoring, or IP Management</strong> by itself. Per-app access for SSO users
                is entirely separate and comes from the Realm roles claim above matched against
                <NuxtLink to="/admin/access" class="text-beacon hover:underline">App &amp; Access</NuxtLink> - a user can be a global Admin here and still see
                zero apps if their realm roles aren't mapped there.
              </p>
            </div>
          </div>

          <footer class="flex flex-col gap-3 border-t border-hull pt-4">
            <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <UButton
                color="neutral"
                variant="soft"
                label="Test & query"
                icon="i-lucide-radar"
                :loading="testingOidc"
                :disabled="!oidcForm.issuer || !oidcForm.clientId"
                @click="testOidc"
              />
              <div class="flex gap-2">
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
              </div>
            </div>

            <p class="flex items-start gap-1.5 text-xs text-faint">
              <UIcon name="i-lucide-info" class="mt-0.5 size-3.5 shrink-0" />
              Opens a diagnostic view for discovery, popup login, token validation, mapped claims, and the UserInfo response.
            </p>
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
            <UFormField label="Manager group">
              <UInput v-model="ldapForm.managerGroup" class="w-full font-mono" />
            </UFormField>
            <UFormField label="Operator group">
              <UInput v-model="ldapForm.operatorGroup" class="w-full font-mono" />
            </UFormField>
          </div>

          <div class="panel-flush flex items-start gap-2 bg-surface-2/50 p-3 text-xs">
            <UIcon name="i-lucide-info" class="mt-0.5 size-4 shrink-0 text-beacon" />
            <p class="text-(--color-muted)">
              <strong class="text-foam">Admin group</strong>, <strong class="text-foam">Manager group</strong>, and <strong class="text-foam">Operator group</strong> only set the user's
              <strong class="text-foam">global portal role</strong> (same authority split as OIDC, above) - they never grant
              Docker/Monitoring/IP Management access by themselves.
            </p>
          </div>
          <div class="notice-warning panel-flush flex items-start gap-2 p-3 text-xs">
            <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-4 shrink-0" />
            <p>
              LDAP logins do not currently carry realm roles, so the
              <NuxtLink to="/admin/access" class="underline">App &amp; Access</NuxtLink> role map has no effect for LDAP users - they get the
              global role above and no per-app access at all, unless separately promoted to a local admin account on the Users page.
            </p>
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

    <UModal
      v-model:open="oidcGuideOpen"
      title="OIDC setup guide"
      description="Configure the provider, understand each field, and expose Keycloak client roles."
      :ui="{ content: 'w-[calc(100vw-2rem)] max-w-4xl' }"
    >
      <template #body>
        <div class="max-h-[min(74dvh,54rem)] overflow-y-auto pr-1">
          <UTabs :items="oidcGuideTabs" variant="link" :unmount-on-hide="false" class="w-full">
            <template #quickstart>
              <div class="space-y-5 pt-4">
                <div class="notice-info flex items-start gap-3 p-3 text-sm">
                  <UIcon name="i-lucide-link" class="mt-0.5 size-4 shrink-0" />
                  <div class="min-w-0">
                    <p class="font-medium text-foam">Register this callback URL</p>
                    <p class="mt-1 break-all font-mono text-xs text-(--color-muted)">{{ auth?.oidc.effectiveRedirectUri || 'Save or reload settings to calculate the callback URL.' }}</p>
                  </div>
                </div>

                <ol class="space-y-3">
                  <li v-for="(item, index) in oidcGuide.checklist" :key="item" class="flex gap-3 rounded-lg border border-hull-soft p-3 text-sm text-(--color-muted)">
                    <span class="flex size-6 shrink-0 items-center justify-center rounded-full bg-beacon/10 text-xs font-semibold text-beacon">
                      {{ index + 1 }}
                    </span>
                    <span class="pt-0.5">{{ item }}</span>
                  </li>
                </ol>

                <div class="rounded-lg border border-hull-soft p-3 text-xs text-(--color-muted)">
                  <p class="font-medium text-foam">Recommended verification</p>
                  <p class="mt-1">Save the OIDC settings first, then select <strong class="text-foam">Test & query</strong>. Run discovery and complete the popup login to inspect validated token claims and the UserInfo response.</p>
                </div>
              </div>
            </template>

            <template #fields>
              <div class="grid gap-3 pt-4 sm:grid-cols-2">
                <article v-for="field in oidcGuide.fields" :key="field.name" class="rounded-lg border border-hull-soft p-4">
                  <p class="text-sm font-medium text-foam">{{ field.name }}</p>
                  <p class="mt-1.5 text-xs leading-5 text-(--color-muted)">{{ field.detail }}</p>
                </article>
              </div>
            </template>

            <template #keycloak>
              <div class="space-y-5 pt-4">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div class="min-w-0">
                    <h4 class="text-sm font-semibold text-foam">Expose client roles in tokens and UserInfo</h4>
                    <p class="mt-1 text-xs leading-5 text-(--color-muted)">
                      To populate <code class="break-all font-mono text-foam">{{ keycloakClientRolesGuide.claimPath }}</code>, configure a
                      <strong class="text-foam">User Client Role</strong> protocol mapper and assign at least one role from that client to the login user.
                    </p>
                  </div>
                  <UButton
                    size="sm"
                    color="neutral"
                    variant="soft"
                    icon="i-lucide-external-link"
                    label="Mapper reference"
                    to="https://www.keycloak.org/admin-api/protocol-mappers#_openid-connect"
                    target="_blank"
                    class="shrink-0"
                  />
                </div>

                <ol class="space-y-3">
                  <li v-for="(item, index) in keycloakClientRolesGuide.steps" :key="item" class="flex gap-3 rounded-lg border border-hull-soft p-3 text-sm text-(--color-muted)">
                    <span class="flex size-6 shrink-0 items-center justify-center rounded-full bg-beacon/10 text-xs font-semibold text-beacon">{{ index + 1 }}</span>
                    <span class="pt-0.5">{{ item }}</span>
                  </li>
                </ol>

                <div>
                  <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Mapper settings</p>
                  <dl class="divide-y divide-hull-soft overflow-hidden rounded-lg border border-hull-soft">
                    <div v-for="([label, value]) in keycloakClientRolesGuide.settings" :key="label" class="grid gap-1 p-3 text-xs sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-3">
                      <dt class="text-faint">{{ label }}</dt>
                      <dd class="break-all font-mono text-foam">{{ value }}</dd>
                    </div>
                  </dl>
                </div>

                <div>
                  <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Expected response shape</p>
                  <pre class="max-h-72 overflow-auto rounded-lg border border-hull-soft bg-abyss p-4 text-xs text-(--color-muted)">{{ formatJson(keycloakClientRolesGuide.expected) }}</pre>
                </div>

                <div class="notice-warning flex items-start gap-2 p-3 text-xs">
                  <UIcon name="i-lucide-info" class="mt-0.5 size-4 shrink-0" />
                  <p>If a built-in <strong class="text-foam">client roles</strong> mapper already exists in the <strong class="text-foam">roles</strong> client scope, edit it instead of creating a duplicate. Enable access token, ID token, and UserInfo output, then sign in again to issue fresh tokens.</p>
                </div>
              </div>
            </template>
          </UTabs>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end">
          <UButton color="neutral" variant="ghost" label="Close" @click="oidcGuideOpen = false" />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="oidcTestOpen"
      title="OIDC test & query"
      description="Query discovery, then run a real login and UserInfo request in a separate popup."
      :ui="{ content: 'w-[calc(100vw-2rem)] max-w-5xl' }"
    >
      <template #body>
        <div class="max-h-[min(76dvh,58rem)] space-y-4 overflow-y-auto pr-1">
          <section class="panel-flush overflow-hidden">
            <header class="flex flex-wrap items-center justify-between gap-3 border-b border-hull p-4">
              <div>
                <div class="flex items-center gap-2">
                  <span class="flex size-7 items-center justify-center rounded-full bg-beacon/10 text-xs font-semibold text-beacon">1</span>
                  <h4 class="text-sm font-semibold text-foam">Discovery query</h4>
                </div>
                <p class="mt-1 pl-9 text-xs text-faint">Uses the issuer and Client ID currently entered in the form.</p>
              </div>
              <UButton
                size="sm"
                color="neutral"
                variant="soft"
                label="Query again"
                icon="i-lucide-refresh-cw"
                :loading="testingOidc"
                @click="testOidc"
              />
            </header>

            <div v-if="testingOidc" class="flex items-center justify-center gap-2 p-10 text-sm text-(--color-muted)">
              <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" /> Querying provider discovery...
            </div>
            <div v-else-if="oidcTestErrorMsg" class="notice-danger m-4 flex items-start gap-2 p-3 text-sm">
              <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-4 shrink-0" />
              <span>{{ oidcTestErrorMsg }}</span>
            </div>
            <div v-else-if="oidcTestResult" class="space-y-4 p-4">
              <div class="flex flex-wrap items-center gap-2">
                <UBadge color="success" variant="subtle" icon="i-lucide-check" label="Discovery passed" />
                <span class="text-xs text-faint">{{ oidcTestResult.tookMs }}ms</span>
                <span class="truncate font-mono text-xs text-(--color-muted)">{{ oidcTestResult.issuer }}</span>
              </div>

              <dl class="grid gap-3 sm:grid-cols-2">
                <div v-for="(endpoint, name) in oidcTestResult.endpoints" :key="name" class="min-w-0 rounded-lg bg-surface-2/60 p-3">
                  <dt class="text-[11px] font-semibold uppercase tracking-wide text-faint">{{ name }}</dt>
                  <dd class="mt-1 break-all font-mono text-xs text-foam">{{ endpoint || 'Not advertised' }}</dd>
                </div>
              </dl>

              <div class="grid gap-3 md:grid-cols-2">
                <div v-if="oidcTestResult.scopesSupported?.length" class="rounded-lg border border-hull-soft p-3">
                  <p class="text-xs font-medium text-foam">Supported scopes</p>
                  <p class="mt-1 break-words font-mono text-xs text-(--color-muted)">{{ oidcTestResult.scopesSupported.join(', ') }}</p>
                </div>
                <div v-if="oidcTestResult.claimsSupported?.length" class="rounded-lg border border-hull-soft p-3">
                  <p class="text-xs font-medium text-foam">Supported claims</p>
                  <p class="mt-1 break-words font-mono text-xs text-(--color-muted)">{{ oidcTestResult.claimsSupported.join(', ') }}</p>
                </div>
              </div>

              <details class="group rounded-lg border border-hull-soft">
                <summary class="cursor-pointer select-none px-3 py-2.5 text-xs font-medium text-foam">Raw discovery response</summary>
                <pre class="max-h-80 overflow-auto border-t border-hull-soft bg-abyss p-3 text-xs text-(--color-muted)">{{ formatJson(oidcTestResult.discovery) }}</pre>
              </details>
              <p class="text-xs text-faint">{{ oidcTestResult.scope }}</p>
            </div>
          </section>

          <section class="panel-flush overflow-hidden">
            <header class="flex flex-wrap items-center justify-between gap-3 border-b border-hull p-4">
              <div>
                <div class="flex items-center gap-2">
                  <span class="flex size-7 items-center justify-center rounded-full bg-beacon/10 text-xs font-semibold text-beacon">2</span>
                  <h4 class="text-sm font-semibold text-foam">Login & UserInfo test</h4>
                </div>
                <p class="mt-1 pl-9 text-xs text-faint">Uses saved settings and keeps this admin session unchanged.</p>
              </div>
              <UButton
                size="sm"
                color="primary"
                label="Test login in popup"
                icon="i-lucide-external-link"
                :loading="testingOidcLogin"
                :disabled="testingOidc || !oidcTestResult || oidcLoginHasUnsavedChanges"
                @click="startOidcLoginTest"
              />
            </header>

            <div class="space-y-4 p-4">
              <div v-if="oidcLoginHasUnsavedChanges" class="notice-warning flex items-start gap-2 p-3 text-xs">
                <UIcon name="i-lucide-save" class="mt-0.5 size-4 shrink-0" />
                <p>Save the current OIDC changes before testing login. The popup intentionally reads the saved server-side settings and client secret.</p>
              </div>

              <div v-if="testingOidcLogin" class="flex items-center gap-3 rounded-lg border border-beacon/30 bg-beacon/5 p-4">
                <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin text-beacon" />
                <div>
                  <p class="text-sm font-medium text-foam">Waiting for the provider login</p>
                  <p class="text-xs text-faint">Complete sign-in in the popup. The diagnostic response will appear there and here.</p>
                </div>
              </div>

              <div v-if="oidcLoginTestErrorMsg" class="notice-danger flex items-start gap-2 p-3 text-sm">
                <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-4 shrink-0" />
                <span>{{ oidcLoginTestErrorMsg }}</span>
              </div>

              <template v-if="oidcLoginTestResult">
                <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div class="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3">
                    <p class="text-[11px] font-semibold uppercase tracking-wide text-faint">Login flow</p>
                    <p class="mt-1 flex items-center gap-1.5 text-sm font-medium text-emerald-400"><UIcon name="i-lucide-check" /> Passed</p>
                    <p class="mt-1 text-xs text-faint">{{ oidcLoginTestResult.tookMs }}ms total</p>
                  </div>
                  <div class="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3">
                    <p class="text-[11px] font-semibold uppercase tracking-wide text-faint">ID token</p>
                    <p class="mt-1 flex items-center gap-1.5 text-sm font-medium text-emerald-400"><UIcon name="i-lucide-shield-check" /> Valid</p>
                    <p class="mt-1 text-xs text-faint">{{ oidcLoginTestResult.idToken.tookMs }}ms verification</p>
                  </div>
                  <div
                    class="rounded-lg border p-3"
                    :class="oidcLoginTestResult.accessToken.valid === true ? 'border-emerald-500/25 bg-emerald-500/5' : oidcLoginTestResult.accessToken.valid === false ? 'border-red-500/25 bg-red-500/5' : 'border-hull-soft'"
                  >
                    <p class="text-[11px] font-semibold uppercase tracking-wide text-faint">Access token</p>
                    <p v-if="oidcLoginTestResult.accessToken.valid === true" class="mt-1 flex items-center gap-1.5 text-sm font-medium text-emerald-400"><UIcon name="i-lucide-shield-check" /> JWT valid</p>
                    <p v-else-if="oidcLoginTestResult.accessToken.valid === false" class="mt-1 flex items-center gap-1.5 text-sm font-medium text-red-400"><UIcon name="i-lucide-x" /> JWT invalid</p>
                    <p v-else class="mt-1 text-sm font-medium text-faint">{{ oidcLoginTestResult.accessToken.format === 'opaque' ? 'Opaque token' : 'Not returned' }}</p>
                    <p v-if="oidcLoginTestResult.accessToken.tookMs != null" class="mt-1 text-xs text-faint">{{ oidcLoginTestResult.accessToken.tookMs }}ms verification</p>
                  </div>
                  <div
                    class="rounded-lg border p-3"
                    :class="oidcLoginTestResult.rolesClaim.found ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-amber-500/25 bg-amber-500/5'"
                  >
                    <p class="text-[11px] font-semibold uppercase tracking-wide text-faint">Configured roles claim</p>
                    <p v-if="oidcLoginTestResult.rolesClaim.found" class="mt-1 flex items-center gap-1.5 text-sm font-medium text-emerald-400"><UIcon name="i-lucide-check" /> Found</p>
                    <p v-else class="mt-1 flex items-center gap-1.5 text-sm font-medium text-amber-400"><UIcon name="i-lucide-triangle-alert" /> Missing</p>
                    <p class="mt-1 truncate font-mono text-xs text-faint" :title="oidcLoginTestResult.rolesClaim.path">{{ oidcLoginTestResult.rolesClaim.source || oidcLoginTestResult.rolesClaim.path }}</p>
                  </div>
                  <div class="rounded-lg border border-hull-soft p-3">
                    <p class="text-[11px] font-semibold uppercase tracking-wide text-faint">Mapped user</p>
                    <p class="mt-1 truncate text-sm font-medium text-foam" :title="oidcLoginTestResult.mappedUser.username">{{ oidcLoginTestResult.mappedUser.username }}</p>
                    <p class="mt-1 text-xs capitalize text-faint">{{ oidcLoginTestResult.mappedUser.role }}</p>
                  </div>
                  <div
                    class="rounded-lg border p-3"
                    :class="oidcLoginTestResult.userinfo.ok === true ? 'border-emerald-500/25 bg-emerald-500/5' : oidcLoginTestResult.userinfo.ok === false ? 'border-red-500/25 bg-red-500/5' : 'border-hull-soft'"
                  >
                    <p class="text-[11px] font-semibold uppercase tracking-wide text-faint">UserInfo endpoint</p>
                    <p v-if="oidcLoginTestResult.userinfo.ok === true" class="mt-1 flex items-center gap-1.5 text-sm font-medium text-emerald-400"><UIcon name="i-lucide-check" /> Passed</p>
                    <p v-else-if="oidcLoginTestResult.userinfo.ok === false" class="mt-1 flex items-center gap-1.5 text-sm font-medium text-red-400"><UIcon name="i-lucide-x" /> Failed</p>
                    <p v-else class="mt-1 text-sm font-medium text-faint">Not available</p>
                    <p v-if="oidcLoginTestResult.userinfo.tookMs != null" class="mt-1 text-xs text-faint">{{ oidcLoginTestResult.userinfo.tookMs }}ms response</p>
                  </div>
                </div>

                <details
                  v-if="!oidcLoginTestResult.rolesClaim.found && oidcLoginTestResult.rolesClaim.path === keycloakClientRolesGuide.claimPath"
                  class="notice-warning overflow-hidden"
                  open
                >
                  <summary class="cursor-pointer select-none p-3 text-sm font-medium">
                    Keycloak setup for missing <span class="font-mono">{{ keycloakClientRolesGuide.claimPath }}</span>
                  </summary>
                  <div class="space-y-3 border-t border-amber-500/20 p-3 text-xs">
                    <p>
                      The test checks the validated ID token, UserInfo response, and validated JWT access token. The claim is absent from all three.
                      Configure the mapper and make sure the login user actually has at least one role from <strong>client-knetrahub-web</strong>.
                    </p>
                    <ol class="space-y-1.5">
                      <li v-for="(item, index) in keycloakClientRolesGuide.steps" :key="item" class="flex gap-2">
                        <span class="font-mono">{{ index + 1 }}.</span><span>{{ item }}</span>
                      </li>
                    </ol>
                    <dl class="grid gap-1.5 sm:grid-cols-2">
                      <div v-for="([label, value]) in keycloakClientRolesGuide.settings" :key="label" class="rounded border border-amber-500/20 p-2">
                        <dt class="text-faint">{{ label }}</dt>
                        <dd class="mt-0.5 break-all font-mono text-foam">{{ value }}</dd>
                      </div>
                    </dl>
                    <div>
                      <p class="mb-1 font-medium text-foam">Expected nested response</p>
                      <pre class="overflow-auto rounded border border-amber-500/20 bg-abyss p-3 text-xs">{{ formatJson(keycloakClientRolesGuide.expected) }}</pre>
                    </div>
                  </div>
                </details>

                <div v-else-if="!oidcLoginTestResult.rolesClaim.found" class="notice-warning flex items-start gap-2 p-3 text-xs">
                  <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-4 shrink-0" />
                  <p>
                    Configured roles claim <span class="font-mono">{{ oidcLoginTestResult.rolesClaim.path }}</span> was not found in the validated ID token,
                    UserInfo response, or validated JWT access token. Check the provider mapper and the test user's assigned roles.
                  </p>
                </div>

                <div v-else class="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p class="text-xs font-medium text-foam">Configured roles claim resolved</p>
                      <p class="mt-1 break-all font-mono text-xs text-faint">{{ oidcLoginTestResult.rolesClaim.path }}</p>
                    </div>
                    <UBadge color="success" variant="subtle" :label="`Found in ${oidcLoginTestResult.rolesClaim.source}`" />
                  </div>
                  <pre class="mt-3 max-h-48 overflow-auto rounded border border-emerald-500/20 bg-abyss p-3 text-xs text-(--color-muted)">{{ formatJson(oidcLoginTestResult.rolesClaim.value) }}</pre>
                </div>

                <div class="rounded-lg border border-hull-soft p-3">
                  <div class="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p class="text-xs font-medium text-foam">UserInfo endpoint test</p>
                      <p class="mt-1 break-all font-mono text-xs text-faint">{{ oidcLoginTestResult.userinfo.endpoint || 'Not advertised in discovery' }}</p>
                    </div>
                    <UBadge
                      :color="oidcLoginTestResult.userinfo.ok === true ? 'success' : oidcLoginTestResult.userinfo.ok === false ? 'error' : 'neutral'"
                      variant="subtle"
                      :label="oidcLoginTestResult.userinfo.ok === true ? 'Response valid' : oidcLoginTestResult.userinfo.ok === false ? 'Request failed' : 'Not run'"
                    />
                  </div>
                  <p v-if="oidcLoginTestResult.userinfo.error" class="mt-2 text-xs text-red-400">{{ oidcLoginTestResult.userinfo.error }}</p>
                </div>

                <div class="grid gap-3 lg:grid-cols-2">
                  <details class="rounded-lg border border-hull-soft" open>
                    <summary class="cursor-pointer select-none px-3 py-2.5 text-xs font-medium text-foam">Mapped user data</summary>
                    <pre class="max-h-80 overflow-auto border-t border-hull-soft bg-abyss p-3 text-xs text-(--color-muted)">{{ formatJson(oidcLoginTestResult.mappedUser) }}</pre>
                  </details>
                  <details class="rounded-lg border border-hull-soft" open>
                    <summary class="cursor-pointer select-none px-3 py-2.5 text-xs font-medium text-foam">UserInfo response data</summary>
                    <pre class="max-h-80 overflow-auto border-t border-hull-soft bg-abyss p-3 text-xs text-(--color-muted)">{{ formatJson(oidcLoginTestResult.userinfo.response || { error: oidcLoginTestResult.userinfo.error }) }}</pre>
                  </details>
                  <details class="rounded-lg border border-hull-soft">
                    <summary class="cursor-pointer select-none px-3 py-2.5 text-xs font-medium text-foam">Token endpoint response (tokens redacted)</summary>
                    <pre class="max-h-80 overflow-auto border-t border-hull-soft bg-abyss p-3 text-xs text-(--color-muted)">{{ formatJson(oidcLoginTestResult.token.response) }}</pre>
                  </details>
                  <details class="rounded-lg border border-hull-soft">
                    <summary class="cursor-pointer select-none px-3 py-2.5 text-xs font-medium text-foam">Validated ID token claims</summary>
                    <pre class="max-h-80 overflow-auto border-t border-hull-soft bg-abyss p-3 text-xs text-(--color-muted)">{{ formatJson({ header: oidcLoginTestResult.idToken.header, claims: oidcLoginTestResult.idToken.claims }) }}</pre>
                  </details>
                  <details class="rounded-lg border border-hull-soft" :open="oidcLoginTestResult.rolesClaim.source === 'access_token'">
                    <summary class="cursor-pointer select-none px-3 py-2.5 text-xs font-medium text-foam">Validated access token claims</summary>
                    <pre class="max-h-80 overflow-auto border-t border-hull-soft bg-abyss p-3 text-xs text-(--color-muted)">{{ formatJson({ header: oidcLoginTestResult.accessToken.header, claims: oidcLoginTestResult.accessToken.claims, error: oidcLoginTestResult.accessToken.error }) }}</pre>
                  </details>
                </div>
              </template>
            </div>
          </section>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full items-center justify-between gap-3">
          <p class="text-xs text-faint">Sensitive token values are redacted in every response view.</p>
          <UButton color="neutral" variant="ghost" label="Close" @click="oidcTestOpen = false" />
        </div>
      </template>
    </UModal>
  </div>
</template>
