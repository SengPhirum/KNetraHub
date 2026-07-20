<script setup lang="ts">
// Public page reached from the emailed reset link (?token=…). The token is the
// authorization - the visitor may not be signed in. We validate it first, then
// let them choose a new portal security password.
definePageMeta({ layout: 'auth' })

const { appearance } = useAppearance()
const route = useRoute()
const token = computed(() => String(route.query.token ?? ''))

const { data: check, pending: checking } = await useFetch('/api/auth/security-password/reset', {
  query: { token },
  default: () => ({ valid: false, username: null as string | null })
})

const password = ref('')
const confirm = ref('')
const errorMsg = ref('')
const working = ref(false)
const done = ref(false)

async function submit() {
  errorMsg.value = ''
  if (password.value.length < 6) { errorMsg.value = 'Security password must be at least 6 characters.'; return }
  if (password.value !== confirm.value) { errorMsg.value = 'Password and confirmation do not match.'; return }
  working.value = true
  try {
    await $fetch('/api/auth/security-password/reset', {
      method: 'POST',
      body: { token: token.value, password: password.value, confirm: confirm.value }
    })
    done.value = true
  } catch (e: any) {
    errorMsg.value = e?.data?.statusMessage || 'Could not set your security password.'
  } finally {
    working.value = false
  }
}
</script>

<template>
  <div class="w-full max-w-sm">
    <div class="mb-8 text-center lg:hidden">
      <KNetraHubLogo size="lg" class="mx-auto max-w-full" />
    </div>

    <div class="panel p-6 space-y-5 sm:p-7">
      <div class="flex items-center gap-3">
        <span class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 ring-1 ring-hull">
          <UIcon name="i-lucide-shield-check" class="size-5 text-beacon" />
        </span>
        <div class="min-w-0">
          <h1 class="truncate font-display text-2xl font-semibold text-foam">Security password</h1>
          <p class="text-xs text-faint">{{ appearance.appName }}</p>
        </div>
      </div>

      <!-- Loading -->
      <p v-if="checking" class="flex items-center gap-2 text-sm text-(--color-muted)">
        <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" /> Checking your link…
      </p>

      <!-- Success -->
      <template v-else-if="done">
        <p class="status-up flex items-center gap-2 text-sm">
          <UIcon name="i-lucide-circle-check" class="size-4" /> Your security password is set.
        </p>
        <p class="text-xs text-(--color-muted)">
          You can now use it to confirm deleting critical records across every app.
        </p>
        <UButton block size="lg" color="primary" label="Go to sign in" trailing-icon="i-lucide-arrow-right" to="/login" />
      </template>

      <!-- Invalid / expired token -->
      <template v-else-if="!check?.valid">
        <p class="status-down flex items-start gap-2 text-sm">
          <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-4 shrink-0" />
          <span>This reset link is invalid, already used, or has expired. Ask a portal admin to send a new one, or sign in and set it from Preferences.</span>
        </p>
        <UButton block size="lg" color="neutral" variant="outline" label="Back to sign in" to="/login" />
      </template>

      <!-- Set new password -->
      <form v-else class="space-y-4" @submit.prevent="submit">
        <p class="text-xs text-(--color-muted)">
          Choose a new security password for <span class="font-medium text-foam">{{ check?.username }}</span>.
          This is a separate secret from your sign-in password, used to confirm critical deletes.
        </p>
        <div>
          <label class="block text-xs font-medium text-(--color-muted) mb-1.5">New security password</label>
          <UInput v-model="password" type="password" icon="i-lucide-lock" placeholder="At least 6 characters" autocomplete="new-password" size="lg" class="w-full" :disabled="working" />
        </div>
        <div>
          <label class="block text-xs font-medium text-(--color-muted) mb-1.5">Confirm password</label>
          <UInput v-model="confirm" type="password" icon="i-lucide-lock" placeholder="Re-enter it" autocomplete="new-password" size="lg" class="w-full" :disabled="working" @keydown.enter="submit" />
        </div>

        <p v-if="errorMsg" class="status-down flex items-center gap-2 text-sm">
          <UIcon name="i-lucide-circle-alert" class="size-4" /> {{ errorMsg }}
        </p>

        <UButton type="submit" block size="lg" color="primary" :loading="working" label="Set security password" icon="i-lucide-shield-check" />
      </form>
    </div>
  </div>
</template>
