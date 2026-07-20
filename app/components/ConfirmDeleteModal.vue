<script setup lang="ts">
import { deleteTier, type DeleteTier } from '~~/shared/utils/deleteTiers'

// Tiered delete confirmation. The record's `type` key resolves its tier from
// the central registry (shared/utils/deleteTiers.ts):
//   high   → re-enter the portal security password
//   medium → type the record's exact name
//   low    → a plain yes / no
// The paired server guard is requireDeleteConfirm (server/utils/deleteConfirm.ts).
// `action` receives the headers to attach to the DELETE request, e.g.:
//   $fetch(url, { method: 'DELETE', headers })
// Throw from `action` to keep the dialog open and show the error (a mistyped
// password/name doesn't dump the user back to square one). Delete-conflict 409s
// that carry data.usedBy are rendered as a list of what still uses the record.
const props = withDefaults(defineProps<{
  /** Registry key, e.g. 'ipmgt.subnet' - drives which tier of confirmation shows. */
  type: string
  /** The record's exact name; required for the medium tier (what the user types). */
  itemName?: string
  title: string
  /** What is about to happen, e.g. `Subnet 10.0.0.0/24 will be permanently removed.` */
  message?: string
  confirmLabel?: string
  action: (headers: Record<string, string>) => Promise<unknown> | unknown
}>(), { confirmLabel: 'Delete' })

const open = defineModel<boolean>('open', { default: false })
const tier = computed<DeleteTier>(() => deleteTier(props.type))

// High tier reuses the portal security password; route to its set-up prompt if
// the user never configured one (see server 428 securityPasswordRequired).
const { promptOpen: securityPromptOpen, configured: securityConfigured } = useSecurityPassword()

const password = ref('')
const typedName = ref('')
const errorMsg = ref('')
const usedBy = ref<{ type: string; name: string }[]>([])
const working = ref(false)

watch(open, (isOpen) => {
  if (isOpen) {
    password.value = ''
    typedName.value = ''
    errorMsg.value = ''
    usedBy.value = []
  }
})

const nameMatches = computed(() =>
  props.itemName
    ? typedName.value.trim().toLowerCase() === props.itemName.trim().toLowerCase()
    : typedName.value.trim().length > 0
)

const canConfirm = computed(() => {
  if (working.value) return false
  if (tier.value === 'high') return password.value.length > 0
  if (tier.value === 'medium') return nameMatches.value
  return true
})

async function submit() {
  if (tier.value === 'high' && !password.value) { errorMsg.value = 'Enter your security password to continue.'; return }
  if (tier.value === 'medium' && !nameMatches.value) { errorMsg.value = 'Type the exact name to confirm.'; return }
  working.value = true
  errorMsg.value = ''
  usedBy.value = []
  const headers: Record<string, string> = {}
  if (tier.value === 'high') headers['x-confirm-password'] = password.value
  else if (tier.value === 'medium') headers['x-confirm-name'] = typedName.value.trim()
  try {
    await props.action(headers)
    open.value = false
  } catch (e: any) {
    const message = e?.data?.statusMessage || e?.message || 'Delete failed'
    if (e?.data?.data?.securityPasswordRequired) {
      securityConfigured.value = false
      open.value = false
      securityPromptOpen.value = true
      return
    }
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

const description = computed(() =>
  tier.value === 'high' ? 'Confirm with your security password to proceed.'
    : tier.value === 'medium' ? 'Type the record name to confirm.'
      : 'This action cannot be undone.'
)
</script>

<template>
  <UModal v-model:open="open" :title="title" :description="description" :dismissible="!working">
    <template #body>
      <div class="space-y-4">
        <div v-if="message" class="notice-danger panel-flush flex items-start gap-2 p-3 text-xs">
          <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-4 shrink-0" />
          <span>{{ message }}</span>
        </div>

        <!-- high: security password -->
        <UFormField v-if="tier === 'high'" label="Your security password" required :error="errorMsg || undefined">
          <UInput
            v-model="password"
            type="password"
            class="w-full"
            autocomplete="off"
            autofocus
            :disabled="working"
            @keydown.enter="submit"
          />
        </UFormField>

        <!-- medium: type the exact name -->
        <UFormField v-else-if="tier === 'medium'" required :error="errorMsg || undefined">
          <template #label>
            Type <span class="font-mono font-semibold text-foam">{{ itemName }}</span> to confirm
          </template>
          <UInput
            v-model="typedName"
            class="w-full"
            autocomplete="off"
            autofocus
            :placeholder="itemName"
            :disabled="working"
            @keydown.enter="submit"
          />
        </UFormField>

        <!-- low: nothing extra beyond the message + buttons -->
        <p v-else-if="errorMsg" class="text-xs text-rose-400">{{ errorMsg }}</p>

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
        <UButton
          color="error"
          :label="confirmLabel"
          :icon="tier === 'high' ? 'i-lucide-shield-check' : 'i-lucide-trash-2'"
          :loading="working"
          :disabled="!canConfirm"
          @click="submit"
        />
      </div>
    </template>
  </UModal>
</template>
