<script setup lang="ts">
definePageMeta({ layout: 'auth' })

const { login } = useAuth()
const config = useRuntimeConfig()
const toast = useToast()

const username = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

async function submit() {
  if (!username.value || !password.value) return
  loading.value = true
  error.value = ''
  try {
    await login(username.value, password.value)
    toast.add({ title: 'Welcome to DockHub', icon: 'i-lucide-ship-wheel', color: 'primary' })
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
      <span class="sonar mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-beacon/15 ring-1 ring-beacon/40">
        <UIcon name="i-lucide-ship-wheel" class="size-7 text-beacon" />
      </span>
      <h1 class="font-display text-3xl font-semibold tracking-tight">{{ config.public.appName }}</h1>
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

      <p class="text-center text-xs text-faint">
        <template v-if="config.public.ldapEnabled">
          <UIcon name="i-lucide-shield-check" class="size-3 inline" /> LDAP enabled · local accounts also accepted
        </template>
        <template v-else>
          Local accounts · default <span class="font-mono">admin / admin</span>
        </template>
      </p>
    </form>
  </div>
</template>
