<script setup lang="ts">
// Preferences > Security > Two-factor authentication. Placeholder until 2FA is
// implemented (it's on the project roadmap). Listed here so the Security
// structure is in place; real TOTP enrollment drops into this page later.
const { user } = useAuth()
const isLocal = computed(() => user.value?.source === 'local')
</script>

<template>
  <div>
    <PageHeader title="Two-factor authentication" subtitle="Add a second step when signing in" icon="i-lucide-shield-check" />

    <section class="panel flex flex-col items-center gap-3 p-10 text-center max-w-2xl">
      <UIcon name="i-lucide-shield-ellipsis" class="size-7 text-faint" />
      <div>
        <h3 class="font-display text-sm font-semibold text-foam">Two-factor authentication isn't available yet</h3>
        <p class="mt-1 max-w-md text-xs text-(--color-muted)">
          <template v-if="isLocal">
            TOTP-based 2FA (authenticator app) for local accounts is on the roadmap and will be
            set up here. For now, secure your account with a strong, unique password.
          </template>
          <template v-else>
            Sign-in for your account is handled by your identity provider - configure
            multi-factor authentication there.
          </template>
        </p>
      </div>
      <UBadge color="neutral" variant="subtle" label="Coming soon" />
    </section>
  </div>
</template>
