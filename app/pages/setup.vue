<script setup lang="ts">
definePageMeta({ layout: 'auth' })

const { setupRequired } = useSetupStatus()
const { appearance } = useAppearance()
const toast = useToast()

const username = ref('')
const displayName = ref('')
const password = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const error = ref('')

async function submit() {
  error.value = ''
  if (!username.value || !password.value) return
  if (password.value !== confirmPassword.value) {
    error.value = 'Passwords do not match'
    return
  }
  if (password.value.length < 8) {
    error.value = 'Password must be at least 8 characters'
    return
  }

  loading.value = true
  try {
    await $fetch('/api/auth/setup', {
      method: 'POST',
      body: { username: username.value, displayName: displayName.value, password: password.value }
    })
    // Update the cached flag directly rather than re-fetching - avoids a
    // round-trip and, more importantly, avoids a redirect race back to
    // /setup if the middleware re-reads a stale value before this resolves.
    setupRequired.value = false
    toast.add({ title: 'Administrator account created', description: 'Sign in with your new account to continue.', color: 'primary' })
    await navigateTo('/login')
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'Could not create the administrator account'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="w-full max-w-sm">
    <div class="mb-8 text-center lg:hidden">
      <KNetraHubLogo size="lg" class="mx-auto max-w-full" />
      <p class="mt-2 text-sm text-(--color-muted)">Docker orchestration, monitoring, and IP management — unified in one hub.</p>
    </div>

    <form class="panel p-6 space-y-5 sm:p-7" @submit.prevent="submit">
      <div class="flex items-center gap-3">
        <span class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 ring-1 ring-hull">
          <UIcon name="i-lucide-shield-plus" class="size-5 text-beacon" />
        </span>
        <div class="min-w-0">
          <h1 class="font-display text-lg font-semibold text-foam">Welcome to {{ appearance.appName }}</h1>
          <p class="text-xs text-faint">Create the administrator account to finish setup</p>
        </div>
      </div>

      <p class="flex items-start gap-2 rounded-lg border border-beacon/30 bg-beacon/10 px-3 py-2 text-xs text-(--color-muted)">
        <UIcon name="i-lucide-info" class="mt-0.5 size-3.5 shrink-0 text-beacon" />
        This one-time step only appears because no administrator account exists yet. You'll sign in with these credentials on the next screen.
      </p>

      <div class="space-y-4">
        <div>
          <label class="block text-xs font-medium text-(--color-muted) mb-1.5">Username</label>
          <UInput
            v-model="username"
            icon="i-lucide-user"
            placeholder="Choose a username"
            autocomplete="username"
            size="lg"
            class="w-full"
          />
        </div>
        <div>
          <label class="block text-xs font-medium text-(--color-muted) mb-1.5">Display name <span class="text-faint">(optional)</span></label>
          <UInput
            v-model="displayName"
            icon="i-lucide-id-card"
            placeholder="Shown in the header and audit log"
            autocomplete="name"
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
            placeholder="At least 8 characters"
            autocomplete="new-password"
            size="lg"
            class="w-full"
          />
        </div>
        <div>
          <label class="block text-xs font-medium text-(--color-muted) mb-1.5">Confirm password</label>
          <UInput
            v-model="confirmPassword"
            type="password"
            icon="i-lucide-lock"
            placeholder="Re-enter the password"
            autocomplete="new-password"
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
        label="Create administrator account"
        trailing-icon="i-lucide-arrow-right"
      />
    </form>
  </div>
</template>
