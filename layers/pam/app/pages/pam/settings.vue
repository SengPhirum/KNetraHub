<script setup lang="ts">
// PAM settings — reveal display window, rotation defaults, session timeouts,
// break-glass limits, ZSP mode and audit checkpoint interval.
definePageMeta({ middleware: [() => !useAuth().hasApp('pam', 'admin') ? navigateTo('/pam') : undefined] })
const toast = useToast()
const { data, status, error, refresh } = useAsyncData('pamSettings',
  () => $fetch<any>('/api/pam/v1/settings'), { server: false, default: () => ({ settings: {} }) })

const form = reactive<Record<string, any>>({})
watch(() => data.value?.settings, (s) => { if (s) Object.assign(form, s) }, { immediate: true })

const saving = ref(false)
async function save() {
  saving.value = true
  try {
    await $fetch('/api/pam/v1/settings', { method: 'PUT', body: { settings: {
      'reveal.default_seconds': Number(form['reveal.default_seconds']),
      'reveal.disable_copy': form['reveal.disable_copy'],
      'reveal.watermark': form['reveal.watermark'],
      'reveal.rotate_after': form['reveal.rotate_after'],
      'rotation.default_interval_days': Number(form['rotation.default_interval_days']),
      'session.idle_timeout_minutes': Number(form['session.idle_timeout_minutes']),
      'session.max_duration_minutes': Number(form['session.max_duration_minutes']),
      'break_glass.max_minutes': Number(form['break_glass.max_minutes']),
      'break_glass.require_incident': form['break_glass.require_incident'],
      'zsp.enabled': form['zsp.enabled'],
      'ticket.accept_unvalidated': form['ticket.accept_unvalidated'],
      'audit.checkpoint_interval_minutes': Number(form['audit.checkpoint_interval_minutes'])
    } } })
    toast.add({ title: 'Settings saved', color: 'success' })
    await refresh()
  } catch (e: any) { toast.add({ title: 'Could not save', description: e?.data?.statusMessage, color: 'error' }) }
  finally { saving.value = false }
}
</script>

<template>
  <div class="mx-auto max-w-2xl">
    <PageHeader title="PAM settings" subtitle="Vault, session, break-glass and audit configuration" icon="i-lucide-settings" />
    <DataState :status="status" :error="error">
      <div class="space-y-4">
        <section class="panel space-y-3 p-5">
          <h2 class="font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted)">Credential reveal</h2>
          <UFormField label="Display window (seconds)"><UInput v-model.number="form['reveal.default_seconds']" type="number" /></UFormField>
          <UCheckbox v-model="form['reveal.disable_copy']" label="Disable copying revealed credentials" />
          <UCheckbox v-model="form['reveal.watermark']" label="Watermark revealed credentials with user + time" />
          <UCheckbox v-model="form['reveal.rotate_after']" label="Rotate credential immediately after reveal" />
        </section>
        <section class="panel space-y-3 p-5">
          <h2 class="font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted)">Rotation & sessions</h2>
          <UFormField label="Default rotation interval (days)"><UInput v-model.number="form['rotation.default_interval_days']" type="number" /></UFormField>
          <UFormField label="Session idle timeout (minutes)"><UInput v-model.number="form['session.idle_timeout_minutes']" type="number" /></UFormField>
          <UFormField label="Session max duration (minutes)"><UInput v-model.number="form['session.max_duration_minutes']" type="number" /></UFormField>
        </section>
        <section class="panel space-y-3 p-5">
          <h2 class="font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted)">Break-glass, ZSP & audit</h2>
          <UFormField label="Break-glass max duration (minutes)"><UInput v-model.number="form['break_glass.max_minutes']" type="number" /></UFormField>
          <UCheckbox v-model="form['break_glass.require_incident']" label="Require an incident number for break-glass" />
          <UCheckbox v-model="form['zsp.enabled']" label="Zero-standing-privilege mode (flag standing access as a violation)" />
          <UCheckbox v-model="form['ticket.accept_unvalidated']" label="Accept tickets without an integration (record as unvalidated)" />
          <UFormField label="Audit checkpoint interval (minutes)"><UInput v-model.number="form['audit.checkpoint_interval_minutes']" type="number" /></UFormField>
        </section>
        <div class="flex justify-end"><UButton :loading="saving" icon="i-lucide-save" @click="save">Save settings</UButton></div>
      </div>
    </DataState>
  </div>
</template>
