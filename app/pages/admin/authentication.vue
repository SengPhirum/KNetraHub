<script setup lang="ts">
// Admin > Security > Authentication. OIDC SSO + LDAP/AD configuration (env
// defaults overridable by DB-stored settings). Was a tab in the old /settings.
definePageMeta({ middleware: 'admin' })

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
  rolesClaim: string
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
    'Map the admin and operator groups, then save and test SSO login.'
  ],
  fields: [
    { name: 'Issuer URL', detail: 'Use the exact issuer from provider discovery, without the /.well-known/openid-configuration suffix.' },
    { name: 'Redirect URI', detail: 'Leave blank to use the shown effective URL, or set a public URL when KNetraHub is behind a proxy.' },
    { name: 'Scope', detail: 'Keep openid. Add profile, email, and groups when your provider requires scopes for those claims.' },
    { name: 'Claims', detail: 'Username, display name, and groups can use plain claim names or dot paths such as realm_access.roles.' },
    { name: 'Groups', detail: 'OIDC group values are matched to KNetraHub roles. Users without a match become viewers.' }
  ]
}

const ldapGuide = {
  checklist: [
    'Use an LDAP or LDAPS URL reachable from the KNetraHub server.',
    'Enter a bind DN that can search users, or leave it blank for anonymous bind if allowed.',
    'Set the user search base and a filter that includes {{username}}.',
    'Map the directory groups that should become KNetraHub admins or operators.',
    'Save, then test with a directory user before relying on LDAP broadly.'
  ],
  fields: [
    { name: 'Server URL', detail: 'Prefer ldaps:// on port 636 when available. ldap:// on port 389 depends on your directory policy.' },
    { name: 'Bind DN', detail: 'Use a service account DN, for example cn=dockhub,ou=service,dc=example,dc=com.' },
    { name: 'Search base', detail: 'Point this at the subtree containing user accounts, not the whole directory when you can avoid it.' },
    { name: 'Search filter', detail: 'Active Directory often uses (sAMAccountName={{username}}); OpenLDAP commonly uses (uid={{username}}).' },
    { name: 'Groups', detail: 'KNetraHub checks the user memberOf values against the admin and operator group fields.' }
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
  rolesClaim: '',
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
    rolesClaim: value.oidc.rolesClaim,
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
    toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' })
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
    toast.add({ title: 'Reset failed', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    resettingProvider.value = null
  }
}
</script>

<template>
  <div>
    <PageHeader title="Authentication" subtitle="OIDC single sign-on and LDAP / Active Directory" icon="i-lucide-shield-check">
      <template #actions>
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" :loading="authStatus === 'pending'" @click="refreshAuth()" />
      </template>
    </PageHeader>

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
            <UFormField label="Realm roles claim" description="Drives per-app access (App & Access page).">
              <UInput v-model="oidcForm.rolesClaim" class="w-full font-mono" placeholder="realm_access.roles" />
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
