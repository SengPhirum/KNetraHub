<script setup lang="ts">
// IP Management admin settings. Gated by the ipmgt admin tier (ipmgt.settings).
definePageMeta({
  middleware: [
    function () {
      const { hasPermission } = useAuth()
      if (!hasPermission('ipmgt.settings')) return navigateTo('/ipmgt')
    }
  ]
})

const toast = useToast()
const { data: settings, status, error, refresh } = useAsyncData('ipamSettings', () => $fetch<any>('/api/ipmgt/settings'), { server: false, default: () => null })
const { data: sections } = useAsyncData('ipamSettingsSections', () => $fetch<any[]>('/api/ipmgt/sections'), { server: false, default: () => [] })

const form = reactive<any>({})
watch(settings, (s) => { if (s) Object.assign(form, s) }, { immediate: true })

const sectionItems = computed(() => [{ value: '', label: '— None —' }, ...(sections.value || []).map((s: any) => ({ value: s.id, label: s.name }))])
const scanItems = [{ value: 'ping', label: 'ICMP ping' }, { value: 'fping', label: 'fping' }, { value: 'none', label: 'Disabled' }]
const dnsItems = [{ value: 'manual', label: 'Manual' }, { value: 'powerdns', label: 'PowerDNS' }, { value: 'other', label: 'Other (future)' }]
const statusItems = SELECTABLE_STATUSES.map((s) => ({ value: s, label: ipStatusMeta(s).label }))

const saving = ref(false)
async function save() {
  saving.value = true
  try {
    await $fetch('/api/ipmgt/settings', { method: 'PUT', body: { ...form, defaultSectionId: form.defaultSectionId || null } })
    toast.add({ title: 'Settings saved', color: 'primary', icon: 'i-lucide-check' })
    await refresh()
  } catch (e: any) { toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' }) }
  finally { saving.value = false }
}
</script>

<template>
  <div>
    <PageHeader title="IP Management Settings" subtitle="Defaults, scanning, requests and integrations" icon="i-lucide-settings">
      <template #actions>
        <UButton size="sm" icon="i-lucide-save" :loading="saving" @click="save">Save changes</UButton>
      </template>
    </PageHeader>

    <DataState :status="status" :error="error">
      <div v-if="settings" class="space-y-4">
        <section class="panel p-5">
          <h2 class="mb-4 font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted)">Defaults</h2>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Default section">
              <USelect v-model="form.defaultSectionId" :items="sectionItems" value-key="value" label-key="label" class="w-full" />
            </UFormField>
            <UFormField label="Default IP status">
              <USelect v-model="form.defaultIpStatus" :items="statusItems" value-key="value" label-key="label" class="w-full" />
            </UFormField>
            <UFormField label="Subnet usage warning threshold (%)">
              <UInput v-model.number="form.usageWarningThreshold" type="number" min="1" max="100" class="w-full" />
            </UFormField>
          </div>
        </section>

        <section class="panel p-5">
          <h2 class="mb-4 font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted)">Scanning</h2>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Default scan method">
              <USelect v-model="form.scanMethod" :items="scanItems" value-key="value" label-key="label" class="w-full" />
            </UFormField>
            <div class="flex items-end pb-2">
              <UCheckbox v-model="form.scanEnabled" label="Enable subnet scanning" />
            </div>
          </div>
        </section>

        <section class="panel p-5">
          <h2 class="mb-4 font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted)">Requests & notifications</h2>
          <div class="flex flex-wrap gap-6">
            <UCheckbox v-model="form.requestsEnabled" label="Enable IP requests" />
            <UCheckbox v-model="form.notificationsEnabled" label="Enable notifications" />
          </div>
        </section>

        <section class="panel p-5">
          <h2 class="mb-1 font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted)">DNS integration</h2>
          <p class="mb-4 text-xs text-faint">Provider hooks are wired but external DNS updates stay disabled until configured (placeholder).</p>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="DNS provider">
              <USelect v-model="form.dnsProvider" :items="dnsItems" value-key="value" label-key="label" class="w-full" />
            </UFormField>
            <div class="flex items-end pb-2">
              <UCheckbox v-model="form.dnsEnabled" label="Enable DNS integration" />
            </div>
          </div>
        </section>
      </div>
    </DataState>
  </div>
</template>
