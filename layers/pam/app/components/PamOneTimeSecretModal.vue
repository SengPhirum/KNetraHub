<script setup lang="ts">
/**
 * One-time secret dialog (app tokens, vendor invitation tokens, recovery codes).
 * Replaces the persistent inline alert banner: the value is shown in a modal
 * that must be explicitly acknowledged + dismissed, so a one-time secret is not
 * left lingering in the page. Copy button, and no backdrop-dismiss (can't lose
 * it by mis-click).
 */
const props = defineProps<{ title?: string; label?: string; value: string }>()
const open = defineModel<boolean>('open', { default: false })
const toast = useToast()
const ack = ref(false)
watch(open, (o) => { if (o) ack.value = false })

async function copy() {
  try { await navigator.clipboard?.writeText(props.value); toast.add({ title: 'Copied', color: 'success' }) }
  catch { toast.add({ title: 'Copy unavailable — select and copy manually', color: 'warning' }) }
}
</script>

<template>
  <UModal v-model:open="open" :title="title || 'One-time secret'" :dismissible="false">
    <template #body>
      <div class="space-y-3">
        <div class="notice-danger panel-flush flex items-start gap-2 p-3 text-xs">
          <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-4 shrink-0" />
          <span>This {{ label || 'value' }} is shown <b>once</b> and cannot be retrieved again. Copy and store it securely now.</span>
        </div>
        <div class="panel-flush flex items-center gap-2 rounded p-3">
          <code class="select-all break-all font-mono text-sm text-foam">{{ value }}</code>
          <UButton size="xs" variant="ghost" icon="i-lucide-copy" class="ml-auto shrink-0" @click="copy">Copy</UButton>
        </div>
        <UCheckbox v-model="ack" label="I have copied and stored it securely" />
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end">
        <UButton :disabled="!ack" icon="i-lucide-check" @click="open = false">Done</UButton>
      </div>
    </template>
  </UModal>
</template>
