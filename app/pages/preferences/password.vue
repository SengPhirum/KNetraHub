<script setup lang="ts">
import { passwordPolicyErrors, passwordPolicySummary, type PasswordPolicy } from '~~/shared/utils/passwordPolicy'

// Preferences > Account > Password change. Self-service via PATCH
// /api/user/profile (requireUser, own account only) - works for any local user,
// not just admins. LDAP/OIDC passwords live in the directory/provider.
const { user } = useAuth()
const toast = useToast()
const { data: passwordPolicy } = useFetch<PasswordPolicy>('/api/auth/password-policy')
const effectivePasswordPolicy = computed<PasswordPolicy>(() => passwordPolicy.value || {
  passwordMinLength: 8,
  passwordRequireUppercase: false,
  passwordRequireLowercase: false,
  passwordRequireNumber: false,
  passwordRequireSpecial: false
})
const passwordRuleSummary = computed(() => passwordPolicySummary(effectivePasswordPolicy.value))

const canChangePassword = computed(() => user.value?.source === 'local')

// Portal security password (a second secret, separate from the login password,
// used to confirm critical deletes). Applies to every account type - including
// SSO/LDAP - which is why this card lives on a page reachable by all users.
const { configured: securityConfigured, promptOpen: securityPromptOpen, fetchStatus: fetchSecurityStatus } = useSecurityPassword()
onMounted(() => { if (securityConfigured.value === null) fetchSecurityStatus() })

const pwd = reactive({ a: '', b: '' })
const saving = ref(false)
async function changePassword() {
  if (!pwd.a || pwd.a !== pwd.b) { toast.add({ title: 'Passwords do not match', color: 'warning' }); return }
  const policyErrors = passwordPolicyErrors(pwd.a, effectivePasswordPolicy.value)
  if (policyErrors.length) { toast.add({ title: 'Password does not meet policy', description: policyErrors.join('. '), color: 'warning' }); return }
  saving.value = true
  try {
    await $fetch('/api/user/profile', { method: 'PATCH', body: { password: pwd.a } })
    toast.add({ title: 'Password changed', color: 'primary', icon: 'i-lucide-key-round' })
    pwd.a = ''; pwd.b = ''
  } catch (e: any) {
    toast.add({ title: 'Change failed', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader title="Password & security" subtitle="Your login password and portal security password" icon="i-lucide-key-round" />

    <div class="panel p-5 max-w-2xl">
      <div v-if="canChangePassword" class="grid gap-3 sm:grid-cols-2 max-w-md">
        <UFormField label="New password">
          <UInput v-model="pwd.a" type="password" class="w-full" :disabled="saving" />
          <p class="mt-1.5 text-xs text-faint">{{ passwordRuleSummary }}</p>
        </UFormField>
        <UFormField label="Confirm">
          <UInput v-model="pwd.b" type="password" class="w-full" :disabled="saving" />
        </UFormField>
        <div class="sm:col-span-2">
          <UButton color="primary" label="Change password" icon="i-lucide-key-round" :loading="saving" @click="changePassword" />
        </div>
      </div>
      <p v-else class="text-sm text-faint">
        {{ user?.source === 'ldap' ? 'Your password is managed by your LDAP directory.' : 'Your password is managed by your identity provider.' }}
      </p>
    </div>

    <div class="panel mt-5 max-w-2xl p-5">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <h2 class="flex items-center gap-2 font-display text-sm font-semibold text-foam">
            <UIcon name="i-lucide-shield-check" class="size-4 text-beacon" />
            Security password
          </h2>
          <p class="mt-1 text-sm text-(--color-muted)">
            A separate secret you key in to confirm deleting critical records in any app. Shared
            across every app; distinct from your login password.
          </p>
          <p class="mt-2 text-xs" :class="securityConfigured ? 'text-running' : 'text-faint'">
            <UIcon :name="securityConfigured ? 'i-lucide-check-circle' : 'i-lucide-circle-dashed'" class="mr-1 inline size-3.5 align-text-bottom" />
            {{ securityConfigured === null ? 'Checking…' : securityConfigured ? 'Configured' : 'Not set up yet' }}
          </p>
        </div>
        <UButton
          color="primary"
          variant="soft"
          :icon="securityConfigured ? 'i-lucide-pencil' : 'i-lucide-shield-plus'"
          :label="securityConfigured ? 'Change' : 'Set up'"
          @click="securityPromptOpen = true"
        />
      </div>
    </div>

    <SecurityPasswordModal v-model:open="securityPromptOpen" :dismissible="true" />
  </div>
</template>
