<script setup lang="ts">
// Admin > Logs > System Log. Portal-level runtime/diagnostic events plus the
// portal's own user-activity trail, with the housekeeping (retention) config
// for ALL module logs - only the portal (super) admin can change retention.
definePageMeta({ middleware: 'admin' })

const toast = useToast()
const { user } = useAuth()
const isSuperAdmin = computed(() => user.value?.role === 'admin')

interface Housekeeping {
  activityRetentionDays: number
  activityMaxRows: number
  systemRetentionDays: number
  systemMaxRows: number
}

const { data: housekeeping } = useFetch<Housekeeping>('/api/system/logs/housekeeping', { lazy: true })
const form = reactive<Housekeeping>({ activityRetentionDays: 90, activityMaxRows: 100000, systemRetentionDays: 30, systemMaxRows: 50000 })
watch(housekeeping, (h) => { if (h) Object.assign(form, h) }, { immediate: true })

const savingHousekeeping = ref(false)
async function saveHousekeeping() {
  savingHousekeeping.value = true
  try {
    const res: any = await $fetch('/api/system/logs/housekeeping', { method: 'PUT', body: { ...form } })
    Object.assign(form, res)
    const trimmed = (res.activityRemoved || 0) + (res.systemRemoved || 0)
    toast.add({
      title: 'Housekeeping saved',
      description: trimmed ? `Applied immediately - ${trimmed} old entries trimmed` : 'Applied immediately',
      color: 'primary',
      icon: 'i-lucide-check'
    })
  } catch (e: any) {
    toast.add({ title: 'Save failed', description: e?.data?.statusMessage || e?.message, color: 'error' })
  } finally {
    savingHousekeeping.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader title="System log" subtitle="Portal runtime events, user activity and log housekeeping" icon="i-lucide-file-text" />

    <div class="space-y-4">
      <section v-if="isSuperAdmin" class="panel p-5">
        <header class="mb-4">
          <h3 class="font-display text-sm font-semibold text-foam flex items-center gap-2">
            <UIcon name="i-lucide-eraser" class="size-4 text-beacon" />
            Housekeeping
          </h3>
          <p class="mt-1 text-xs text-(--color-muted)">
            Retention for the per-module activity and system logs across all apps (Docker, Monitoring, IP Management and the portal).
            0 days = keep until the row cap. Applied daily and immediately on save.
          </p>
        </header>
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <UFormField label="Activity retention (days)">
            <UInput v-model.number="form.activityRetentionDays" type="number" min="0" max="3650" class="w-full font-mono" />
          </UFormField>
          <UFormField label="Activity max rows">
            <UInput v-model.number="form.activityMaxRows" type="number" min="1000" class="w-full font-mono" />
          </UFormField>
          <UFormField label="System retention (days)">
            <UInput v-model.number="form.systemRetentionDays" type="number" min="0" max="3650" class="w-full font-mono" />
          </UFormField>
          <UFormField label="System max rows">
            <UInput v-model.number="form.systemMaxRows" type="number" min="1000" class="w-full font-mono" />
          </UFormField>
        </div>
        <div class="mt-4 flex justify-end">
          <UButton icon="i-lucide-save" label="Save housekeeping" :loading="savingHousekeeping" @click="saveHousekeeping" />
        </div>
      </section>

      <section class="panel p-5">
        <header class="mb-4">
          <h3 class="font-display text-sm font-semibold text-foam flex items-center gap-2">
            <UIcon name="i-lucide-scroll-text" class="size-4 text-beacon" />
            Portal logs
          </h3>
          <p class="mt-1 text-xs text-(--color-muted)">
            Portal-scoped user activity and system events. Each app's own logs live in its admin settings
            (Dock, Monitoring, IP Management); state-changing user actions there are recorded automatically.
          </p>
        </header>
        <ModuleLogs module="portal" />
      </section>
    </div>
  </div>
</template>
