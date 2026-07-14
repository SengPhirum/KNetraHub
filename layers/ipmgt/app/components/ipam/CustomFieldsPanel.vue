<script setup lang="ts">
// Generic custom-fields section for an entity form. Renders whatever active
// field definitions exist for `entityType` (nothing, if none do) and loads
// current values when `entityId` is known (edit mode). Custom field values
// live in a separate table from the entity itself, so saving is a two-step
// process: the parent form saves the entity first, then calls
// `saveValues(id)` on this component (via a template ref) with the
// resulting/existing entity id.
const props = defineProps<{ entityType: string; entityId?: string | null }>()

const defs = ref<any[]>([])
const values = reactive<Record<string, any>>({})
const loaded = ref(false)

const REF_ENDPOINTS: Record<string, string> = {
  location_ref: '/api/ipmgt/locations',
  device_ref: '/api/ipmgt/devices',
  customer_ref: '/api/ipmgt/customers'
}
const REF_LABEL_KEY: Record<string, string> = { location_ref: 'name', device_ref: 'hostname', customer_ref: 'name' }
const refOptions = reactive<Record<string, { value: string; label: string }[]>>({})

async function loadRefOptions(fieldType: string) {
  if (refOptions[fieldType] || !REF_ENDPOINTS[fieldType]) return
  const rows = await $fetch<any[]>(REF_ENDPOINTS[fieldType])
  const labelKey = REF_LABEL_KEY[fieldType]
  refOptions[fieldType] = [{ value: '', label: '— None —' }, ...rows.map((r) => ({ value: r.id, label: r[labelKey] }))]
}

function coerceIn(def: any, raw: any) {
  if (raw === undefined || raw === null) return def.field_type === 'multiselect' ? [] : (def.field_type === 'boolean' ? false : '')
  if (def.field_type === 'multiselect') { try { return JSON.parse(raw) } catch { return [] } }
  if (def.field_type === 'boolean') return raw === 'true' || raw === true
  return raw
}

async function load() {
  const res = await $fetch<{ defs: any[]; values: Record<string, string> }>('/api/ipmgt/customfields/values', {
    query: { entity_type: props.entityType, entity_id: props.entityId || undefined }
  })
  defs.value = res.defs
  for (const key of Object.keys(values)) delete values[key]
  for (const def of res.defs) {
    const raw = res.values[def.id] !== undefined ? res.values[def.id] : def.default_value
    values[def.id] = coerceIn(def, raw)
    if (REF_ENDPOINTS[def.field_type]) await loadRefOptions(def.field_type)
  }
  loaded.value = true
}
watch(() => [props.entityType, props.entityId], load, { immediate: true })

function optionItems(def: any): { value: string; label: string }[] {
  let opts: string[] = []
  try { opts = def.options ? JSON.parse(def.options) : [] } catch { opts = [] }
  return opts.map((o) => ({ value: o, label: o }))
}

async function saveValues(entityId: string) {
  if (!defs.value.length) return
  const payload: Record<string, any> = {}
  for (const def of defs.value) {
    const v = values[def.id]
    payload[def.id] = def.field_type === 'multiselect' ? JSON.stringify(v || []) : v
  }
  await $fetch('/api/ipmgt/customfields/values', {
    method: 'PUT',
    body: { entity_type: props.entityType, entity_id: entityId, values: payload }
  })
}

defineExpose({ saveValues })
</script>

<template>
  <div v-if="loaded && defs.length" class="space-y-4 rounded-lg bg-surface-2/40 p-3">
    <p class="text-xs font-semibold uppercase tracking-wider text-faint">Custom fields</p>
    <div class="grid grid-cols-2 gap-4">
      <UFormField v-for="def in defs" :key="def.id" :label="def.label" :required="def.required" class="col-span-2 sm:col-span-1">
        <UTextarea v-if="def.field_type === 'textarea'" v-model="values[def.id]" class="w-full" :rows="2" />
        <UCheckbox v-else-if="def.field_type === 'boolean'" v-model="values[def.id]" :label="def.label" />
        <USelect v-else-if="def.field_type === 'select'" v-model="values[def.id]" :items="optionItems(def)" value-key="value" label-key="label" class="w-full" />
        <USelectMenu v-else-if="def.field_type === 'multiselect'" v-model="values[def.id]" :items="optionItems(def)" value-key="value" label-key="label" multiple class="w-full" />
        <USelect
          v-else-if="['location_ref', 'device_ref', 'customer_ref'].includes(def.field_type)"
          v-model="values[def.id]"
          :items="refOptions[def.field_type] || []"
          value-key="value" label-key="label" class="w-full"
        />
        <UInput
          v-else
          v-model="values[def.id]"
          :type="{ integer: 'number', decimal: 'number', date: 'date', datetime: 'datetime-local', email: 'email', url: 'url' }[def.field_type] || 'text'"
          class="w-full"
        />
      </UFormField>
    </div>
  </div>
</template>
