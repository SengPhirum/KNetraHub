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
    toast.add({ title: 'Welcome to DockHub', color: 'primary' })
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
    <!-- wordmark + thesis -->
    <div class="mb-8 text-center">
      <span class="mx-auto mb-4 flex size-20 items-center justify-center">
        <DockHubLogo variant="icon" class="size-20" />
      </span>
      <DockHubLogo size="lg" class="mx-auto mb-3 max-w-full" />
      <h1 class="sr-only">{{ appearance.appName }}</h1>
      <p class="mt-1.5 text-sm text-(--color-muted)">Run your Docker Swarm from one hub.</p>
    </div>

    <form class="panel p-6 space-y-4" @submit.prevent="submit">
      <div>
        <label class="block text-xs font-medium text-(--color-muted) mb-1.5">Username</label>
        <UInput
          v-model="username"
          icon="i-lucide-user"
          placeholder="admin"
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

      <p class="text-center text-xs text-faint">
        <template v-if="providers?.ldapEnabled">
          <UIcon name="i-lucide-shield-check" class="size-3 inline" /> LDAP enabled · local accounts also accepted
        </template>
        <template v-else-if="providers?.oidcEnabled">
          <UIcon name="i-lucide-shield-check" class="size-3 inline" /> SSO enabled · local accounts also accepted
        </template>
        <template v-else>
          Local accounts · default <span class="font-mono">admin / admin</span>
        </template>
      </p>
    </form>
  </div>
</template>
