<script setup lang="ts">
// SNMP credential profiles (admin tier) — a reusable, ordered list of SNMP
// credential sets. When a device has no device-specific SNMP config and no
// profile assigned yet, discovery tries every profile here in attempt_order
// (lowest first) and pins whichever one responds — the LibreNMS "community
// list" equivalent, so a CIDR scan import doesn't need per-scan SNMP fields.
const { hasMonitoring, canManage } = useMonitoring()
const toast = useToast()

const { data, status, refresh } = useAsyncData('monCredProfiles',
  () => $fetch<any>('/api/monitoring/v1/credential-profiles'),
  { server: false, default: () => ({ items: [] }) })

const versionItems = [{ value: 'v1', label: 'v1' }, { value: 'v2c', label: 'v2c' }, { value: 'v3', label: 'v3' }]
const v3LevelItems = [
  { value: 'noAuthNoPriv', label: 'noAuthNoPriv' }, { value: 'authNoPriv', label: 'authNoPriv' }, { value: 'authPriv', label: 'authPriv' }
]
const authProtoItems = ['md5', 'sha', 'sha224', 'sha256', 'sha384', 'sha512'].map((v) => ({ value: v, label: v }))
const privProtoItems = ['des', 'aes', 'aes256b', 'aes256r'].map((v) => ({ value: v, label: v }))

function blankForm() {
  return {
    name: '', snmp_version: 'v2c', snmp_community: '', snmp_port: 161, snmp_transport: 'udp4', snmp_context: '',
    v3_level: 'authPriv', v3_username: '', v3_auth_protocol: 'sha', v3_auth_password: '',
    v3_priv_protocol: 'aes', v3_priv_password: '', attempt_order: 100
  }
}
const form = reactive(blankForm())
const editingId = ref<number | null>(null)
const modalOpen = ref(false)
const saving = ref(false)

function openCreate() {
  editingId.value = null
  Object.assign(form, blankForm())
  modalOpen.value = true
}
function openEdit(p: any) {
  editingId.value = p.id
  Object.assign(form, blankForm(), {
    name: p.name, snmp_version: p.snmp_version, snmp_port: p.snmp_port, snmp_transport: p.snmp_transport,
    snmp_context: p.snmp_context ?? '', v3_level: p.v3_level ?? 'authPriv', v3_username: p.v3_username ?? '',
    v3_auth_protocol: p.v3_auth_protocol ?? 'sha', v3_priv_protocol: p.v3_priv_protocol ?? 'aes',
    attempt_order: p.attempt_order
  })
  modalOpen.value = true
}

async function save() {
  saving.value = true
  try {
    if (editingId.value) {
      await $fetch(`/api/monitoring/v1/credential-profiles/${editingId.value}`, { method: 'PUT', body: { ...form } })
      toast.add({ title: 'Profile updated', color: 'primary', icon: 'i-lucide-check' })
    } else {
      await $fetch('/api/monitoring/v1/credential-profiles', { method: 'POST', body: { ...form } })
      toast.add({ title: 'Profile created', color: 'primary', icon: 'i-lucide-check' })
    }
    modalOpen.value = false
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' })
  } finally { saving.value = false }
}

const deleteTarget = ref<any>(null)
const deleting = ref(false)
async function confirmDelete() {
  if (!deleteTarget.value) return
  deleting.value = true
  try {
    await $fetch(`/api/monitoring/v1/credential-profiles/${deleteTarget.value.id}`, { method: 'DELETE' })
    toast.add({ title: 'Profile deleted', color: 'primary', icon: 'i-lucide-check' })
    deleteTarget.value = null
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Delete failed', description: e?.data?.statusMessage, color: 'error' })
  } finally { deleting.value = false }
}
</script>

<template>
  <div>
    <PageHeader title="SNMP Credentials" subtitle="Reusable community/v3 sets, tried in order during discovery" icon="i-lucide-key-round">
      <template v-if="hasMonitoring && canManage" #actions>
        <UButton icon="i-lucide-plus" size="sm" @click="openCreate">Add profile</UButton>
      </template>
    </PageHeader>

    <div v-if="!hasMonitoring || !canManage" class="panel p-10 text-center text-muted">Requires the Monitoring admin tier.</div>
    <div v-else class="space-y-4">
      <p class="text-sm text-muted">
        A device with no device-specific SNMP settings and no profile assigned yet gets every profile below tried,
        in order (lowest first), the next time it's discovered — whichever one responds is remembered on the
        device from then on. This is what makes SNMP data show up for hosts imported from a
        <NuxtLink to="/monitoring/discovery" class="text-primary hover:underline">CIDR scan</NuxtLink> without configuring each one by hand.
      </p>

      <div class="panel overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-surface-2 text-left text-xs uppercase text-faint">
            <tr><th class="px-3 py-2">Order</th><th class="px-3 py-2">Name</th><th class="px-3 py-2">Version</th>
              <th class="px-3 py-2">Port / Transport</th><th class="px-3 py-2">Credential</th><th class="px-3 py-2" /></tr>
          </thead>
          <tbody>
            <tr v-if="status === 'pending'"><td colspan="6" class="px-3 py-8 text-center text-muted">Loading…</td></tr>
            <tr v-else-if="!data.items.length"><td colspan="6" class="px-3 py-8 text-center text-muted">No credential profiles yet — devices fall back to the classic "public" v2c community.</td></tr>
            <tr v-for="p in data.items" :key="p.id" class="border-t border-hull">
              <td class="px-3 py-2 text-muted">{{ p.attempt_order }}</td>
              <td class="px-3 py-2 font-medium">{{ p.name }}</td>
              <td class="px-3 py-2">{{ p.snmp_version }}</td>
              <td class="px-3 py-2 text-muted">{{ p.snmp_port }} / {{ p.snmp_transport }}</td>
              <td class="px-3 py-2 text-xs text-faint">
                <span v-if="p.snmp_version === 'v3'">{{ p.v3_username || '—' }} ({{ p.v3_level }})</span>
                <span v-else>{{ p.snmp_community_set ? 'community set' : 'no community set' }}</span>
              </td>
              <td class="px-3 py-2 text-right">
                <UButton size="xs" variant="ghost" icon="i-lucide-pencil" @click="openEdit(p)" />
                <UButton size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" @click="deleteTarget = p" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <UModal v-model:open="modalOpen" :title="editingId ? 'Edit credential profile' : 'Add credential profile'">
      <template #body>
        <div class="space-y-3">
          <UFormField label="Name" required><UInput v-model="form.name" placeholder="Core switches" class="w-full" /></UFormField>
          <UFormField label="Attempt order" description="Lower = tried first during discovery">
            <UInput v-model.number="form.attempt_order" type="number" class="w-full" />
          </UFormField>
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="SNMP version"><USelect v-model="form.snmp_version" :items="versionItems" class="w-full" /></UFormField>
            <UFormField label="Port"><UInput v-model.number="form.snmp_port" type="number" class="w-full" /></UFormField>
          </div>
          <template v-if="form.snmp_version !== 'v3'">
            <UFormField label="Community" :description="editingId ? 'Leave blank to keep the current community' : undefined">
              <UInput v-model="form.snmp_community" type="password" placeholder="public" class="w-full" />
            </UFormField>
          </template>
          <template v-else>
            <div class="grid grid-cols-2 gap-3">
              <UFormField label="Security level"><USelect v-model="form.v3_level" :items="v3LevelItems" class="w-full" /></UFormField>
              <UFormField label="Username"><UInput v-model="form.v3_username" class="w-full" /></UFormField>
            </div>
            <div v-if="form.v3_level !== 'noAuthNoPriv'" class="grid grid-cols-2 gap-3">
              <UFormField label="Auth protocol"><USelect v-model="form.v3_auth_protocol" :items="authProtoItems" class="w-full" /></UFormField>
              <UFormField label="Auth password" :description="editingId ? 'Leave blank to keep current' : undefined">
                <UInput v-model="form.v3_auth_password" type="password" class="w-full" />
              </UFormField>
            </div>
            <div v-if="form.v3_level === 'authPriv'" class="grid grid-cols-2 gap-3">
              <UFormField label="Priv protocol"><USelect v-model="form.v3_priv_protocol" :items="privProtoItems" class="w-full" /></UFormField>
              <UFormField label="Priv password" :description="editingId ? 'Leave blank to keep current' : undefined">
                <UInput v-model="form.v3_priv_password" type="password" class="w-full" />
              </UFormField>
            </div>
          </template>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" @click="modalOpen = false">Cancel</UButton>
          <UButton :loading="saving" :disabled="!form.name" @click="save">{{ editingId ? 'Save' : 'Add profile' }}</UButton>
        </div>
      </template>
    </UModal>

    <UModal :open="!!deleteTarget" title="Delete credential profile" @update:open="(v) => !v && (deleteTarget = null)">
      <template #body>
        <p class="text-sm text-muted">
          Delete <strong>{{ deleteTarget?.name }}</strong>? Devices currently using it fall back to their own
          settings or the classic "public" default — nothing breaks, but discovery stops trying this credential set.
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" @click="deleteTarget = null">Cancel</UButton>
          <UButton color="error" :loading="deleting" @click="confirmDelete">Delete</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
