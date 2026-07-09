<script setup lang="ts">
definePageMeta({ layout: 'auth' })

const { login } = useAuth()
const { appearance } = useAppearance()
const toast = useToast()
const route = useRoute()

// Provider availability is runtime state (env defaults + DB overrides)
const { data: providers } = useFetch('/api/auth/providers')

const username = ref('')
const password = ref('')
const loading = ref(false)
// The OIDC callback redirects here with ?error=... on failure
const error = ref(typeof route.query.error === 'string' ? route.query.error : '')

async function submit() {
  if (!username.value || !password.value) return
  loading.value = true
  error.value = ''
  try {
    await login(username.value, password.value)
    toast.add({ title: 'Welcome to KNetraHub', color: 'primary' })
    await navigateTo('/')
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'Invalid username or password'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="w-full max-w-sm">
    <!-- Compact brand mark - shown when the hero panel is hidden (mobile/tablet); the
         layout's hero panel already carries the full lockup + thesis on lg+ screens. -->
    <div class="mb-8 text-center lg:hidden">
      <KNetraHubLogo size="lg" class="mx-auto max-w-full" />
      <p class="mt-2 text-sm text-(--color-muted)">Docker orchestration, monitoring, and IP management — unified in one hub.</p>
    </div>

    <form class="panel p-6 space-y-5 sm:p-7" @submit.prevent="submit">
      <div class="flex items-center gap-3">
        <span class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 ring-1 ring-hull">
          <UIcon name="i-lucide-log-in" class="size-5 text-beacon" />
        </span>
        <div class="min-w-0">
          <h1 class="truncate font-display text-2xl font-semibold text-foam">{{ appearance.appName }}</h1>
          <p class="text-xs text-faint">Sign in to continue</p>
        </div>
      </div>

      <div class="space-y-4">
        <div>
          <label class="block text-xs font-medium text-(--color-muted) mb-1.5">Username</label>
          <UInput
            v-model="username"
            icon="i-lucide-user"
            placeholder="Username"
            autocomplete="username"
            size="lg"
            class="w-full"
          />
        </div>
        <div>
          <label class="block text-xs font-medium text-(--color-muted) mb-1.5">Password</label>
          <UInput
            v-model="password"
            type="password"
            icon="i-lucide-lock"
            placeholder="••••••••"
            autocomplete="current-password"
            size="lg"
            class="w-full"
          />
        </div>
      </div>

      <p v-if="error" class="status-down flex items-center gap-2 text-sm">
        <UIcon name="i-lucide-circle-alert" class="size-4" /> {{ error }}
      </p>

      <UButton
        type="submit"
        block
        size="lg"
        color="primary"
        :loading="loading"
        label="Sign in"
        trailing-icon="i-lucide-arrow-right"
      />

      <template v-if="providers?.oidcEnabled">
        <div class="flex items-center gap-3 text-xs text-faint">
          <span class="h-px flex-1 bg-(--ui-border)" /> or <span class="h-px flex-1 bg-(--ui-border)" />
        </div>
        <UButton
          block
          size="lg"
          color="neutral"
          variant="outline"
          icon="i-lucide-key-round"
          :label="`Continue with ${providers.oidcProviderName}`"
          to="/api/auth/oidc/login"
          external
        />
      </template>

      <p v-if="providers?.ldapEnabled || providers?.oidcEnabled" class="text-center text-xs text-faint">
        <template v-if="providers?.ldapEnabled">
          <UIcon name="i-lucide-shield-check" class="size-3 inline" /> LDAP enabled · local accounts also accepted
        </template>
        <template v-else>
          <UIcon name="i-lucide-shield-check" class="size-3 inline" /> SSO enabled · local accounts also accepted
        </template>
      </p>
    </form>
  </div>
</template>
