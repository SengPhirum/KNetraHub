<script setup lang="ts">
// Preferences > Security > Secret password. Self-service management of the
// portal security password (the second secret used to confirm deleting
// critical records). Changing it requires the current one; if forgotten, the
// user can email themselves a one-time reset link - the same tokenized flow a
// portal admin can trigger for anyone.
const toast = useToast()
const { configured, fetchStatus, save } = useSecurityPassword()
onMounted(() => { if (configured.value === null) fetchStatus() })

// A change needs the current secret; a first-time set does not.
const isChange = computed(() => configured.value === true)

const current = ref('')
const password = ref('')
const confirm = ref('')
const saving = ref(false)

async function submit() {
  if (password.value.length < 6) { toast.add({ title: 'Too short', description: 'Secret password must be at least 6 characters.', color: 'warning' }); return }
  if (password.value !== confirm.value) { toast.add({ title: 'Passwords do not match', color: 'warning' }); return }
  if (isChange.value && !current.value) { toast.add({ title: 'Enter your current secret password', color: 'warning' }); return }
  saving.value = true
  try {
    await save({ current: isChange.value ? current.value : undefined, password: password.value, confirm: confirm.value })
    toast.add({ title: isChange.value ? 'Secret password changed' : 'Secret password set', color: 'primary', icon: 'i-lucide-shield-check' })
    current.value = ''; password.value = ''; confirm.value = ''
  } catch (e: any) {
    toast.add({ title: 'Could not save', description: e?.data?.statusMessage || e?.message, color: 'error' })
  } finally {
    saving.value = false
  }
}

const sendingReset = ref(false)
async function emailResetLink() {
  sendingReset.value = true
  try {
    await $fetch('/api/user/request-security-password-reset', { method: 'POST' })
    toast.add({ title: 'Reset link sent', description: 'Check your email for a one-time link to set a new secret password.', color: 'primary', icon: 'i-lucide-mail-check' })
  } catch (e: any) {
    toast.add({ title: 'Could not send link', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    sendingReset.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader title="Secret password" subtitle="The second secret used to confirm deleting critical records" icon="i-lucide-lock-keyhole" />

    <div class="panel p-5 max-w-2xl">
      <div class="notice-info panel-flush mb-5 flex items-start gap-2 p-3 text-xs">
        <UIcon name="i-lucide-shield-check" class="mt-0.5 size-4 shrink-0" />
        <span>
          Your secret password is separate from your sign-in password and is shared across every app.
          You're asked for it whenever you delete a critical record.
          <template v-if="configured !== null">
            It is currently
            <span :class="configured ? 'text-running' : 'text-faint'">{{ configured ? 'configured' : 'not set up yet' }}</span>.
          </template>
        </span>
      </div>

      <div class="grid max-w-md gap-3 sm:grid-cols-2">
        <UFormField v-if="isChange" label="Current secret password" class="sm:col-span-2">
          <UInput v-model="current" type="password" autocomplete="off" class="w-full" :disabled="saving" />
        </UFormField>
        <UFormField :label="isChange ? 'New secret password' : 'Secret password'">
          <UInput v-model="password" type="password" autocomplete="new-password" class="w-full" :disabled="saving" />
          <p class="mt-1.5 text-xs text-faint">At least 6 characters.</p>
        </UFormField>
        <UFormField label="Confirm new secret password">
          <UInput v-model="confirm" type="password" autocomplete="new-password" class="w-full" :disabled="saving" @keydown.enter="submit" />
        </UFormField>
        <div class="sm:col-span-2">
          <UButton
            color="primary"
            :label="isChange ? 'Change secret password' : 'Set secret password'"
            icon="i-lucide-shield-check"
            :loading="saving"
            @click="submit"
          />
        </div>
      </div>

      <div v-if="isChange" class="mt-5 border-t border-hull pt-4">
        <p class="text-sm text-(--color-muted)">Forgot your current secret password?</p>
        <p class="mt-0.5 text-xs text-faint">We'll email you a one-time link to set a new one, valid for 24 hours.</p>
        <UButton class="mt-2" color="neutral" variant="soft" icon="i-lucide-mail" label="Email me a reset link" :loading="sendingReset" @click="emailResetLink" />
      </div>
    </div>
  </div>
</template>
