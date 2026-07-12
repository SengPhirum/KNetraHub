<script setup lang="ts">
// Step-up confirmation for critical, hard-to-reverse actions: the user must
// re-enter their password before the action runs. The paired server-side
// check is requirePasswordConfirm (server/utils/confirmAction.ts) - the
// caller's `action` must send the password in the `x-confirm-password`
// header, e.g.:
//   $fetch(url, { method: 'DELETE', headers: { 'x-confirm-password': password } })
// The modal stays open and shows the error when confirmation fails, so a
// mistyped password doesn't dump the user back to square one.
const props = withDefaults(defineProps<{
  title: string
  /** What is about to happen, e.g. `Stack "shop" and all its services will be removed.` */
  message?: string
  confirmLabel?: string
  /** Runs with the entered password; throw to keep the modal open with the error. */
  action: (password: string) => Promise<unknown> | unknown
}>(), {
  confirmLabel: 'Confirm'
})

const open = defineModel<boolean>('open', { default: false })
const password = ref('')
const errorMsg = ref('')
// Delete-conflict 409s name the exact services/containers still using the
// resource (data.usedBy) - shown as a list so the user knows what to detach.
const usedBy = ref<{ type: string; name: string }[]>([])
const working = ref(false)

watch(open, (isOpen) => {
  if (isOpen) {
    password.value = ''
    errorMsg.value = ''
    usedBy.value = []
  }
})

async function submit() {
  if (!password.value) {
    errorMsg.value = 'Enter your password to continue.'
    return
  }
  working.value = true
  errorMsg.value = ''
  usedBy.value = []
  try {
    await props.action(password.value)
    open.value = false
  } catch (e: any) {
    const message = e?.data?.statusMessage || e?.message || 'Confirmation failed'
    const items = e?.data?.data?.usedBy
    if (Array.isArray(items) && items.length) {
      usedBy.value = items
      errorMsg.value = `${String(message).split(' is in use by:')[0]} is still in use by:`
    } else {
      errorMsg.value = message
    }
  } finally {
    working.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="title" description="Confirm with your password to proceed." :dismissible="false">
    <template #body>
      <div class="space-y-4">
        <div v-if="message" class="notice-danger panel-flush flex items-start gap-2 p-3 text-xs">
          <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-4 shrink-0" />
          <span>{{ message }}</span>
        </div>
        <UFormField label="Your password" required :error="errorMsg || undefined">
          <UInput
            v-model="password"
            type="password"
            class="w-full"
            autocomplete="current-password"
            autofocus
            :disabled="working"
            @keydown.enter="submit"
          />
        </UFormField>
        <ul v-if="usedBy.length" class="notice-danger panel-flush space-y-1 p-3 text-xs">
          <li v-for="item in usedBy" :key="`${item.type}:${item.name}`" class="flex items-center gap-2">
            <UIcon :name="item.type === 'service' ? 'i-lucide-layers' : 'i-lucide-box'" class="size-3.5 shrink-0" />
            <span class="font-mono">{{ item.type }} "{{ item.name }}"</span>
          </li>
        </ul>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" label="Cancel" :disabled="working" @click="open = false" />
        <UButton color="error" :label="confirmLabel" icon="i-lucide-shield-check" :loading="working" @click="submit" />
      </div>
    </template>
  </UModal>
</template>
