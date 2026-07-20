<script setup lang="ts">
// Set up or change the portal security password - the second secret (distinct
// from the login password) required to confirm the deletion of critical
// records in any sub-app. When it has never been configured, the layout opens
// this non-dismissibly right after login so every account type, including SSO,
// gets one before it's needed.
const props = withDefaults(defineProps<{
  /** When false (the mandatory first-time prompt) the modal cannot be dismissed
   *  without setting a password - no cancel, no backdrop/escape close. */
  dismissible?: boolean
}>(), { dismissible: true })

const open = defineModel<boolean>('open', { default: false })

const { configured, save } = useSecurityPassword()

const current = ref('')
const password = ref('')
const confirm = ref('')
const errorMsg = ref('')
const working = ref(false)

// Show the "current password" field only when changing an existing one.
const isChange = computed(() => configured.value === true)

watch(open, (isOpen) => {
  if (isOpen) {
    current.value = ''
    password.value = ''
    confirm.value = ''
    errorMsg.value = ''
  }
})

async function submit() {
  errorMsg.value = ''
  if (password.value.length < 6) { errorMsg.value = 'Security password must be at least 6 characters.'; return }
  if (password.value !== confirm.value) { errorMsg.value = 'Password and confirmation do not match.'; return }
  if (isChange.value && !current.value) { errorMsg.value = 'Enter your current security password.'; return }
  working.value = true
  try {
    await save({ current: isChange.value ? current.value : undefined, password: password.value, confirm: confirm.value })
    open.value = false
  } catch (e: any) {
    errorMsg.value = e?.data?.statusMessage || e?.message || 'Could not save security password'
  } finally {
    working.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="isChange ? 'Change security password' : 'Set up your security password'"
    :description="isChange
      ? 'Update the secret used to confirm critical deletes.'
      : 'A one-time step before you can delete critical records.'"
    :dismissible="dismissible"
    :close="dismissible"
  >
    <template #body>
      <div class="space-y-4">
        <div class="notice-info panel-flush flex items-start gap-2 p-3 text-xs">
          <UIcon name="i-lucide-shield-check" class="mt-0.5 size-4 shrink-0" />
          <span>
            Your security password is a separate secret from your login password. You'll be asked
            for it whenever you delete a critical record in any app. It's shared across every app and
            can be reset by a portal admin if you forget it.
          </span>
        </div>

        <UFormField v-if="isChange" label="Current security password" required>
          <UInput v-model="current" type="password" class="w-full" autocomplete="off" :disabled="working" @keydown.enter="submit" />
        </UFormField>

        <UFormField
          :label="isChange ? 'New security password' : 'Security password'"
          required
          description="At least 6 characters."
        >
          <UInput v-model="password" type="password" class="w-full" autocomplete="new-password" :disabled="working" @keydown.enter="submit" />
        </UFormField>

        <UFormField label="Confirm password" required :error="errorMsg || undefined">
          <UInput v-model="confirm" type="password" class="w-full" autocomplete="new-password" :disabled="working" @keydown.enter="submit" />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton v-if="dismissible" color="neutral" variant="ghost" label="Cancel" :disabled="working" @click="open = false" />
        <UButton color="primary" :label="isChange ? 'Update password' : 'Set password'" icon="i-lucide-shield-check" :loading="working" @click="submit" />
      </div>
    </template>
  </UModal>
</template>
